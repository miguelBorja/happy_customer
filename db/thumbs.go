package db

import "time"

// Thumbnail persistence statuses stored on cars.thumb_status.
const (
	ThumbPending = 0
	ThumbStored  = 1
	ThumbMissing = 2 // Crautos returned text/html (listing has no thumbnail)
	ThumbFailed  = 3 // Transient network or storage failure; retried up to MaxThumbTries
	ThumbRemoved = 4 // Manually removed thumbnail; do not re-download

	MaxThumbTries = 5
)

func (d *DB) timeParam(t time.Time) interface{} {
	utc := t.UTC()
	if d.DriverName == "postgres" {
		return utc
	}
	return utc.Format("2006-01-02 15:04:05")
}

// ThumbCandidates returns up to limit listing URLs that need thumbnail processing:
// active pending listings first (newest scraped_at first), then retryable failed listings
// under MaxThumbTries with no attempt in the last 24 hours.
func (d *DB) ThumbCandidates(limit int) ([]string, error) {
	return d.ThumbCandidatesAt(limit, time.Now())
}

// ThumbCandidatesAt is like ThumbCandidates using an explicit reference timestamp for tests.
func (d *DB) ThumbCandidatesAt(limit int, now time.Time) ([]string, error) {
	if limit <= 0 {
		return []string{}, nil
	}
	cutoff := now.UTC().Add(-24 * time.Hour)
	q := `SELECT url FROM cars
		WHERE (thumb_status = 0 AND is_sold = 0)
		   OR (thumb_status = 3 AND thumb_attempts < ?
		       AND (thumb_checked_at IS NULL OR thumb_checked_at < ?))
		ORDER BY CASE WHEN thumb_status = 0 THEN 0 ELSE 1 END, scraped_at DESC
		LIMIT ?`
	rows, err := d.Query(d.queryFormat(q), MaxThumbTries, d.timeParam(cutoff), limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	urls := []string{}
	for rows.Next() {
		var u string
		if err := rows.Scan(&u); err != nil {
			return nil, err
		}
		urls = append(urls, u)
	}
	return urls, rows.Err()
}

// ThumbBackfillCandidates returns up to limit URLs with thumb_status = 0,
// prioritizing active listings before sold listings.
func (d *DB) ThumbBackfillCandidates(limit int) ([]string, error) {
	if limit <= 0 {
		return []string{}, nil
	}
	q := `SELECT url FROM cars
		WHERE thumb_status = 0
		ORDER BY is_sold ASC, scraped_at DESC
		LIMIT ?`
	rows, err := d.Query(d.queryFormat(q), limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	urls := []string{}
	for rows.Next() {
		var u string
		if err := rows.Scan(&u); err != nil {
			return nil, err
		}
		urls = append(urls, u)
	}
	return urls, rows.Err()
}

// SetThumbStatus records the outcome of a thumbnail fetch/upload attempt.
// When status == ThumbFailed, thumb_attempts is incremented as well.
func (d *DB) SetThumbStatus(url string, status int) error {
	return d.SetThumbStatusAt(url, status, time.Now())
}

// SetThumbStatusAt is like SetThumbStatus using an explicit timestamp for tests.
func (d *DB) SetThumbStatusAt(url string, status int, now time.Time) error {
	ts := d.timeParam(now)
	if status == ThumbFailed {
		q := `UPDATE cars
			SET thumb_status = ?, thumb_checked_at = ?, thumb_attempts = COALESCE(thumb_attempts, 0) + 1
			WHERE url = ?`
		_, err := d.Exec(d.queryFormat(q), status, ts, url)
		return err
	}
	q := `UPDATE cars
		SET thumb_status = ?, thumb_checked_at = ?
		WHERE url = ?`
	_, err := d.Exec(d.queryFormat(q), status, ts, url)
	return err
}
