package db

import (
	"database/sql"
	"errors"
	"testing"
	"time"
)

func TestAlertSubscriptions(t *testing.T) {
	d, err := Init(":memory:")
	if err != nil {
		t.Fatalf("Init: %v", err)
	}
	defer d.Close()

	// CreateAlertSubscription: defaults channel, trims query/label, generates tokens.
	sub, err := d.CreateAlertSubscription("", "  Toyota Corolla  ", "  Mi alerta  ")
	if err != nil {
		t.Fatalf("CreateAlertSubscription: %v", err)
	}
	if sub.ID == 0 {
		t.Errorf("expected non-zero ID")
	}
	if sub.Channel != "telegram" {
		t.Errorf("channel = %q, want telegram", sub.Channel)
	}
	if sub.Query != "Toyota Corolla" {
		t.Errorf("query = %q, want trimmed", sub.Query)
	}
	if sub.Label != "Mi alerta" {
		t.Errorf("label = %q, want trimmed", sub.Label)
	}
	if len(sub.ConnectToken) != 32 || len(sub.UnsubscribeToken) != 32 {
		t.Errorf("tokens should be 32 hex chars, got %q / %q", sub.ConnectToken, sub.UnsubscribeToken)
	}
	if sub.ConnectToken == sub.UnsubscribeToken {
		t.Errorf("connect and unsubscribe tokens must differ")
	}
	if sub.Active {
		t.Errorf("new subscription should be inactive")
	}

	// GetAlertByConnectToken.
	got, err := d.GetAlertByConnectToken(sub.ConnectToken)
	if err != nil {
		t.Fatalf("GetAlertByConnectToken: %v", err)
	}
	if got.ID != sub.ID || got.Query != sub.Query {
		t.Errorf("GetAlertByConnectToken returned wrong row: %+v", got)
	}

	// Unknown token -> sql.ErrNoRows.
	if _, err := d.GetAlertByConnectToken("does-not-exist"); !errors.Is(err, sql.ErrNoRows) {
		t.Errorf("expected sql.ErrNoRows, got %v", err)
	}

	// ActivateTelegramAlert.
	activated, err := d.ActivateTelegramAlert(sub.ConnectToken, "123456")
	if err != nil {
		t.Fatalf("ActivateTelegramAlert: %v", err)
	}
	if !activated.Active {
		t.Errorf("expected active subscription")
	}
	if activated.Target != "123456" {
		t.Errorf("target = %q, want 123456", activated.Target)
	}
	if activated.LastNotifiedAt.IsZero() {
		t.Errorf("expected last_notified_at to be set")
	}

	// Activate unknown token -> sql.ErrNoRows.
	if _, err := d.ActivateTelegramAlert("nope", "1"); !errors.Is(err, sql.ErrNoRows) {
		t.Errorf("expected sql.ErrNoRows, got %v", err)
	}

	// ListActiveAlerts.
	active, err := d.ListActiveAlerts("telegram")
	if err != nil {
		t.Fatalf("ListActiveAlerts(telegram): %v", err)
	}
	if len(active) != 1 || active[0].ID != sub.ID {
		t.Errorf("ListActiveAlerts(telegram) = %+v, want 1 row", active)
	}
	if active, err = d.ListActiveAlerts("email"); err != nil {
		t.Fatalf("ListActiveAlerts(email): %v", err)
	}
	if len(active) != 0 {
		t.Errorf("ListActiveAlerts(email) = %d rows, want 0", len(active))
	}
	if active, err = d.ListActiveAlerts(""); err != nil {
		t.Fatalf("ListActiveAlerts(all): %v", err)
	}
	if len(active) != 1 {
		t.Errorf("ListActiveAlerts(all) = %d rows, want 1", len(active))
	}

	// ListAlertsByTarget.
	byTarget, err := d.ListAlertsByTarget("telegram", "123456")
	if err != nil {
		t.Fatalf("ListAlertsByTarget: %v", err)
	}
	if len(byTarget) != 1 || byTarget[0].ID != sub.ID {
		t.Errorf("ListAlertsByTarget = %+v, want 1 row", byTarget)
	}
	if byTarget, err = d.ListAlertsByTarget("telegram", "999"); err != nil {
		t.Fatalf("ListAlertsByTarget wrong target: %v", err)
	}
	if len(byTarget) != 0 {
		t.Errorf("ListAlertsByTarget wrong target = %d rows, want 0", len(byTarget))
	}

	// UpdateAlertNotifiedAt.
	updated := time.Now().Add(-time.Hour).Truncate(time.Second)
	if err := d.UpdateAlertNotifiedAt(sub.ID, updated); err != nil {
		t.Fatalf("UpdateAlertNotifiedAt: %v", err)
	}
	got, err = d.GetAlertByConnectToken(sub.ConnectToken)
	if err != nil {
		t.Fatalf("GetAlertByConnectToken after update: %v", err)
	}
	if got.LastNotifiedAt.Unix() != updated.Unix() {
		t.Errorf("LastNotifiedAt = %v, want %v", got.LastNotifiedAt, updated)
	}

	// DeactivateAlertByUnsubscribeToken.
	ok, err := d.DeactivateAlertByUnsubscribeToken(sub.UnsubscribeToken)
	if err != nil {
		t.Fatalf("DeactivateAlertByUnsubscribeToken: %v", err)
	}
	if !ok {
		t.Errorf("expected unsubscribed to affect a row")
	}
	ok, err = d.DeactivateAlertByUnsubscribeToken("missing")
	if err != nil {
		t.Fatalf("DeactivateAlertByUnsubscribeToken missing: %v", err)
	}
	if ok {
		t.Errorf("expected missing token to affect no rows")
	}

	// Re-activate and test DeactivateAlertsByTarget.
	if _, err := d.ActivateTelegramAlert(sub.ConnectToken, "777"); err != nil {
		t.Fatalf("re-activate: %v", err)
	}
	n, err := d.DeactivateAlertsByTarget("telegram", "777")
	if err != nil {
		t.Fatalf("DeactivateAlertsByTarget: %v", err)
	}
	if n != 1 {
		t.Errorf("DeactivateAlertsByTarget = %d, want 1", n)
	}
	if active, err = d.ListActiveAlerts("telegram"); err != nil {
		t.Fatalf("ListActiveAlerts after deactivate: %v", err)
	}
	if len(active) != 0 {
		t.Errorf("expected no active alerts after deactivation, got %d", len(active))
	}
}
