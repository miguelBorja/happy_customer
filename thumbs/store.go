package thumbs

import (
	"context"
	"regexp"
	"sync"
)

var carIDRegexp = regexp.MustCompile(`[?&]c=(\d+)`)

// Store persists listing thumbnails by object key.
type Store interface {
	// Put stores data at key. Writing an already-existing key is a no-op (idempotent).
	Put(ctx context.Context, key string, data []byte) error
}

// Key returns the GCS object key for a listing ID.
func Key(carID string) string {
	return "thumbs/" + carID + ".jpg"
}

// CarID extracts the Crautos listing ID from a car detail URL.
func CarID(rawURL string) string {
	m := carIDRegexp.FindStringSubmatch(rawURL)
	if len(m) < 2 {
		return ""
	}
	return m[1]
}

// MemStore is an in-memory idempotent Store for tests.
type MemStore struct {
	mu      sync.Mutex
	objects map[string][]byte
	PutErr  error
}

// NewMemStore creates an empty MemStore.
func NewMemStore() *MemStore {
	return &MemStore{objects: make(map[string][]byte)}
}

// Put stores a copy of data under key unless key is already present.
func (m *MemStore) Put(ctx context.Context, key string, data []byte) error {
	if err := ctx.Err(); err != nil {
		return err
	}
	m.mu.Lock()
	defer m.mu.Unlock()
	if m.PutErr != nil {
		return m.PutErr
	}
	if _, exists := m.objects[key]; exists {
		return nil
	}
	cp := make([]byte, len(data))
	copy(cp, data)
	m.objects[key] = cp
	return nil
}

// Get returns a stored thumbnail copy if present.
func (m *MemStore) Get(key string) ([]byte, bool) {
	m.mu.Lock()
	defer m.mu.Unlock()
	b, ok := m.objects[key]
	if !ok {
		return nil, false
	}
	cp := make([]byte, len(b))
	copy(cp, b)
	return cp, true
}

// Len returns how many unique keys are stored.
func (m *MemStore) Len() int {
	m.mu.Lock()
	defer m.mu.Unlock()
	return len(m.objects)
}
