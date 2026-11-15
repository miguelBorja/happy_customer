package thumbs

import (
	"context"
	"errors"
	"fmt"
	"io"
	"net/http"
	"strings"
	"time"
)

const (
	// DefaultPhotoBaseURL is Crautos' base folder for classifieds photos.
	DefaultPhotoBaseURL = "https://crautos.com/clasificados/usados"
	// MaxThumbBytes caps thumbnail reads to guard against oversized or invalid responses.
	MaxThumbBytes = 200 << 10
	// MinThumbBytes rejects truncated or tiny non-thumbnail payloads.
	MinThumbBytes = 500

	crautosUserAgent = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36"
)

var (
	// ErrNoThumb indicates Crautos responded cleanly with no valid JPEG thumbnail (e.g. text/html).
	ErrNoThumb = errors.New("listing has no thumbnail")
	// ErrBlocked indicates Crautos returned 403 or 429 and thumbnail downloading must back off.
	ErrBlocked = errors.New("thumbnail server blocked request (403/429)")
)

// DefaultHTTPClient returns an HTTP client configured with a 15-second timeout.
func DefaultHTTPClient() *http.Client {
	return &http.Client{Timeout: 15 * time.Second}
}

// Fetch downloads the -t.jpg thumbnail for carID from Crautos and validates it is a JPEG image.
func Fetch(ctx context.Context, client *http.Client, carID string) ([]byte, error) {
	return FetchFromBase(ctx, client, DefaultPhotoBaseURL, carID)
}

// FetchFromBase downloads {baseURL}/{carID}-t.jpg and validates content-type, size, and JPEG magic bytes.
func FetchFromBase(ctx context.Context, client *http.Client, baseURL, carID string) ([]byte, error) {
	carID = strings.TrimSpace(carID)
	if carID == "" {
		return nil, ErrNoThumb
	}
	if client == nil {
		client = DefaultHTTPClient()
	}
	base := strings.TrimRight(strings.TrimSpace(baseURL), "/")
	if base == "" {
		base = DefaultPhotoBaseURL
	}

	targetURL := fmt.Sprintf("%s/%s-t.jpg", base, carID)
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, targetURL, nil)
	if err != nil {
		return nil, fmt.Errorf("build thumbnail request: %w", err)
	}
	req.Header.Set("User-Agent", crautosUserAgent)

	resp, err := client.Do(req)
	if err != nil {
		return nil, fmt.Errorf("fetch thumbnail %s: %w", carID, err)
	}
	defer resp.Body.Close()

	if resp.StatusCode == http.StatusForbidden || resp.StatusCode == http.StatusTooManyRequests {
		_, _ = io.Copy(io.Discard, io.LimitReader(resp.Body, 4<<10))
		return nil, fmt.Errorf("%w: status %d", ErrBlocked, resp.StatusCode)
	}
	if resp.StatusCode != http.StatusOK {
		_, _ = io.Copy(io.Discard, io.LimitReader(resp.Body, 4<<10))
		return nil, fmt.Errorf("unexpected thumbnail status %d", resp.StatusCode)
	}

	ct := strings.ToLower(strings.TrimSpace(resp.Header.Get("Content-Type")))
	if !strings.HasPrefix(ct, "image/") {
		_, _ = io.Copy(io.Discard, io.LimitReader(resp.Body, 4<<10))
		return nil, ErrNoThumb
	}

	data, err := io.ReadAll(io.LimitReader(resp.Body, MaxThumbBytes+1))
	if err != nil {
		return nil, fmt.Errorf("read thumbnail body %s: %w", carID, err)
	}
	if len(data) > MaxThumbBytes || len(data) <= MinThumbBytes {
		return nil, ErrNoThumb
	}
	if data[0] != 0xFF || data[1] != 0xD8 || data[2] != 0xFF {
		return nil, ErrNoThumb
	}
	return data, nil
}
