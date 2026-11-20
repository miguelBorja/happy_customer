package db

import (
	"crypto/rand"
	"database/sql"
	"encoding/hex"
	"net/url"
	"strings"
	"time"
)

// MaxAlertCarURLs caps the number of individual car URLs stored in a per-car / favorites alert.
const MaxAlertCarURLs = 50

// ParseAlertCarURLs extracts the watched car URLs from a raw query string. It returns nil
// when the query contains no car URLs (meaning it's a normal saved-search filter query).
func ParseAlertCarURLs(rawQuery string) []string {
	raw := strings.TrimSpace(rawQuery)
	raw = strings.TrimPrefix(raw, "?")
	if raw == "" {
		return nil
	}
	values, err := url.ParseQuery(raw)
	if err != nil {
		return nil
	}

	var out []string
	seen := make(map[string]bool)
	add := func(s string) {
		s = strings.TrimSpace(s)
		if s == "" || seen[s] {
			return
		}
		seen[s] = true
		out = append(out, s)
	}

	for _, v := range values["car"] {
		add(v)
	}
	for _, v := range values["carUrl"] {
		add(v)
	}
	for _, v := range values["urls"] {
		for _, part := range strings.Split(v, ",") {
			add(part)
		}
	}

	if len(out) == 0 {
		return nil
	}
	if len(out) > MaxAlertCarURLs {
		out = out[:MaxAlertCarURLs]
	}
	return out
}

// AlertSubscription represents a saved search that notifies a target (Telegram chat or email address).
type AlertSubscription struct {
	ID               int64
	Channel          string
	Target           string
	Query            string
	Label            string
	ConnectToken     string
	UnsubscribeToken string
	Active           bool
	LastNotifiedAt   time.Time
	CreatedAt        time.Time
}

const alertColumns = "id, channel, target, query, label, connect_token, unsubscribe_token, active, last_notified_at, created_at"

// rowScanner abstracts sql.Row and sql.Rows.
type rowScanner interface {
	Scan(dest ...any) error
}

func scanAlert(s rowScanner) (*AlertSubscription, error) {
	var a AlertSubscription
	var active int
	var last, created sql.NullTime
	if err := s.Scan(
		&a.ID,
		&a.Channel,
		&a.Target,
		&a.Query,
		&a.Label,
		&a.ConnectToken,
		&a.UnsubscribeToken,
		&active,
		&last,
		&created,
	); err != nil {
		return nil, err
	}
	a.Active = active != 0
	if last.Valid {
		a.LastNotifiedAt = last.Time
	}
	if created.Valid {
		a.CreatedAt = created.Time
	}
	return &a, nil
}

func randomHexToken() (string, error) {
	b := make([]byte, 16)
	if _, err := rand.Read(b); err != nil {
		return "", err
	}
	return hex.EncodeToString(b), nil
}

// CreateAlertSubscription creates an inactive subscription with fresh connect/unsubscribe tokens.
func (d *DB) CreateAlertSubscription(channel, query, label string) (*AlertSubscription, error) {
	channel = strings.TrimSpace(channel)
	if channel == "" {
		channel = "telegram"
	}
	query = strings.TrimSpace(query)
	label = strings.TrimSpace(label)

	connectToken, err := randomHexToken()
	if err != nil {
		return nil, err
	}
	unsubscribeToken, err := randomHexToken()
	if err != nil {
		return nil, err
	}

	a := &AlertSubscription{
		Channel:          channel,
		Query:            query,
		Label:            label,
		ConnectToken:     connectToken,
		UnsubscribeToken: unsubscribeToken,
	}

	if d.DriverName == "postgres" {
		q := d.queryFormat("INSERT INTO alert_subscriptions (channel, query, label, connect_token, unsubscribe_token) VALUES (?, ?, ?, ?, ?) RETURNING id, created_at")
		var created sql.NullTime
		if err := d.QueryRow(q, channel, query, label, connectToken, unsubscribeToken).Scan(&a.ID, &created); err != nil {
			return nil, err
		}
		if created.Valid {
			a.CreatedAt = created.Time
		}
		return a, nil
	}

	q := d.queryFormat("INSERT INTO alert_subscriptions (channel, query, label, connect_token, unsubscribe_token) VALUES (?, ?, ?, ?, ?)")
	res, err := d.Exec(q, channel, query, label, connectToken, unsubscribeToken)
	if err != nil {
		return nil, err
	}
	id, err := res.LastInsertId()
	if err != nil {
		return nil, err
	}
	a.ID = id

	var created sql.NullTime
	if err := d.QueryRow(d.queryFormat("SELECT created_at FROM alert_subscriptions WHERE id = ?"), id).Scan(&created); err == nil && created.Valid {
		a.CreatedAt = created.Time
	}
	return a, nil
}

// GetAlertByConnectToken returns the subscription matching connectToken or sql.ErrNoRows.
func (d *DB) GetAlertByConnectToken(connectToken string) (*AlertSubscription, error) {
	q := d.queryFormat("SELECT " + alertColumns + " FROM alert_subscriptions WHERE connect_token = ?")
	return scanAlert(d.QueryRow(q, connectToken))
}

// ActivateTelegramAlert links a chat ID to the subscription and marks it active.
func (d *DB) ActivateTelegramAlert(connectToken, chatID string) (*AlertSubscription, error) {
	connectToken = strings.TrimSpace(connectToken)
	chatID = strings.TrimSpace(chatID)

	q := d.queryFormat("UPDATE alert_subscriptions SET target = ?, active = 1, last_notified_at = COALESCE(last_notified_at, CURRENT_TIMESTAMP) WHERE connect_token = ?")
	res, err := d.Exec(q, chatID, connectToken)
	if err != nil {
		return nil, err
	}
	if n, err := res.RowsAffected(); err != nil {
		return nil, err
	} else if n == 0 {
		return nil, sql.ErrNoRows
	}
	return d.GetAlertByConnectToken(connectToken)
}

// ListActiveAlerts returns all active subscriptions, optionally filtered by channel.
func (d *DB) ListActiveAlerts(channel string) ([]AlertSubscription, error) {
	var (
		rows *sql.Rows
		err  error
	)
	if channel != "" {
		rows, err = d.Query(d.queryFormat("SELECT "+alertColumns+" FROM alert_subscriptions WHERE active = 1 AND channel = ? ORDER BY id"), channel)
	} else {
		rows, err = d.Query("SELECT " + alertColumns + " FROM alert_subscriptions WHERE active = 1 ORDER BY id")
	}
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	return scanAlerts(rows)
}

// ListAlertsByTarget returns active subscriptions for a specific channel/target pair.
func (d *DB) ListAlertsByTarget(channel, target string) ([]AlertSubscription, error) {
	q := d.queryFormat("SELECT " + alertColumns + " FROM alert_subscriptions WHERE active = 1 AND channel = ? AND target = ? ORDER BY id")
	rows, err := d.Query(q, channel, target)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	return scanAlerts(rows)
}

func scanAlerts(rows *sql.Rows) ([]AlertSubscription, error) {
	var out []AlertSubscription
	for rows.Next() {
		a, err := scanAlert(rows)
		if err != nil {
			return nil, err
		}
		out = append(out, *a)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	return out, nil
}

// UpdateAlertNotifiedAt records the last notification time for an alert.
func (d *DB) UpdateAlertNotifiedAt(id int64, t time.Time) error {
	q := d.queryFormat("UPDATE alert_subscriptions SET last_notified_at = ? WHERE id = ?")
	_, err := d.Exec(q, t, id)
	return err
}

// DeactivateAlertByUnsubscribeToken disables a single subscription by its unsubscribe token.
func (d *DB) DeactivateAlertByUnsubscribeToken(token string) (bool, error) {
	q := d.queryFormat("UPDATE alert_subscriptions SET active = 0 WHERE unsubscribe_token = ?")
	res, err := d.Exec(q, token)
	if err != nil {
		return false, err
	}
	n, err := res.RowsAffected()
	if err != nil {
		return false, err
	}
	return n > 0, nil
}

// DeactivateAlertByID disables a single subscription by its id.
func (d *DB) DeactivateAlertByID(id int64) error {
	q := d.queryFormat("UPDATE alert_subscriptions SET active = 0 WHERE id = ?")
	_, err := d.Exec(q, id)
	return err
}

// DeactivateAlertsByTarget disables all active subscriptions for a channel/target pair.
func (d *DB) DeactivateAlertsByTarget(channel, target string) (int64, error) {
	q := d.queryFormat("UPDATE alert_subscriptions SET active = 0 WHERE channel = ? AND target = ? AND active = 1")
	res, err := d.Exec(q, channel, target)
	if err != nil {
		return 0, err
	}
	return res.RowsAffected()
}
