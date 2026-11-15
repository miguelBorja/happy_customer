package thumbs

import (
	"context"
	"errors"
	"fmt"
	"net/http"
	"strings"

	"cloud.google.com/go/storage"
	"google.golang.org/api/googleapi"
)

// GCSStore uploads thumbnails to a Google Cloud Storage bucket.
type GCSStore struct {
	client *storage.Client
	bucket *storage.BucketHandle
}

// NewGCSStore creates a GCSStore authenticated via Application Default Credentials.
func NewGCSStore(ctx context.Context, bucket string) (*GCSStore, error) {
	bucket = strings.TrimSpace(bucket)
	if bucket == "" {
		return nil, errors.New("gcs bucket name is empty")
	}
	c, err := storage.NewClient(ctx)
	if err != nil {
		return nil, fmt.Errorf("create gcs client: %w", err)
	}
	return &GCSStore{
		client: c,
		bucket: c.Bucket(bucket),
	}, nil
}

// Close closes the underlying GCS client.
func (s *GCSStore) Close() error {
	if s == nil || s.client == nil {
		return nil
	}
	return s.client.Close()
}

// Put writes a JPEG thumbnail with immutable caching headers if the object does not exist.
func (s *GCSStore) Put(ctx context.Context, key string, data []byte) error {
	w := s.bucket.Object(key).If(storage.Conditions{DoesNotExist: true}).NewWriter(ctx)
	w.ContentType = "image/jpeg"
	w.CacheControl = "public, max-age=31536000, immutable"
	w.ChunkSize = 0
	if _, err := w.Write(data); err != nil {
		_ = w.Close()
		return fmt.Errorf("write gcs object %s: %w", key, err)
	}
	if err := w.Close(); err != nil {
		var gerr *googleapi.Error
		if errors.As(err, &gerr) && gerr.Code == http.StatusPreconditionFailed {
			return nil
		}
		return fmt.Errorf("close gcs object %s: %w", key, err)
	}
	return nil
}
