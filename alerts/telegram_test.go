package alerts

import (
	"context"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync"
	"testing"

	"crautosdb/db"
)

// capture records the text of every sendMessage call received by the fake server.
type capture struct {
	mu    sync.Mutex
	texts []string
}

func (c *capture) add(text string) {
	c.mu.Lock()
	c.texts = append(c.texts, text)
	c.mu.Unlock()
}

func (c *capture) list() []string {
	c.mu.Lock()
	defer c.mu.Unlock()
	out := make([]string, len(c.texts))
	copy(out, c.texts)
	return out
}

func (c *capture) last() string {
	c.mu.Lock()
	defer c.mu.Unlock()
	if len(c.texts) == 0 {
		return ""
	}
	return c.texts[len(c.texts)-1]
}

func newCaptureServer(t *testing.T, c *capture) *httptest.Server {
	t.Helper()
	return httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if !strings.HasSuffix(r.URL.Path, "/sendMessage") {
			t.Errorf("unexpected path: %s", r.URL.Path)
		}
		var body struct {
			Text string `json:"text"`
		}
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			t.Errorf("decode request body: %v", err)
		}
		c.add(body.Text)
		w.Header().Set("Content-Type", "application/json")
		_, _ = io.WriteString(w, `{"ok":true,"result":{}}`)
	}))
}

func TestSendMessage(t *testing.T) {
	var got map[string]any
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost {
			t.Errorf("expected POST, got %s", r.Method)
		}
		if !strings.HasSuffix(r.URL.Path, "/botTEST/sendMessage") {
			t.Errorf("unexpected path: %s", r.URL.Path)
		}
		if err := json.NewDecoder(r.Body).Decode(&got); err != nil {
			t.Errorf("decode request body: %v", err)
		}
		w.Header().Set("Content-Type", "application/json")
		_, _ = io.WriteString(w, `{"ok":true}`)
	}))
	defer srv.Close()

	client := NewTelegramClient("TEST")
	client.BaseURL = srv.URL

	if err := client.SendMessage(context.Background(), "12345", "<b>hola</b>"); err != nil {
		t.Fatalf("SendMessage returned error: %v", err)
	}

	if got["chat_id"] != "12345" {
		t.Errorf("chat_id = %v, want 12345", got["chat_id"])
	}
	if got["text"] != "<b>hola</b>" {
		t.Errorf("text = %v, want <b>hola</b>", got["text"])
	}
	if got["parse_mode"] != "HTML" {
		t.Errorf("parse_mode = %v, want HTML", got["parse_mode"])
	}
	if got["disable_web_page_preview"] != true {
		t.Errorf("disable_web_page_preview = %v, want true", got["disable_web_page_preview"])
	}
}

func TestSendMessageNotOK(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		_, _ = io.WriteString(w, `{"ok":false,"description":"bad request"}`)
	}))
	defer srv.Close()

	client := NewTelegramClient("TEST")
	client.BaseURL = srv.URL

	if err := client.SendMessage(context.Background(), "1", "hi"); err == nil {
		t.Fatal("expected error when ok=false, got nil")
	}
}

func TestGetUpdates(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodGet {
			t.Errorf("expected GET, got %s", r.Method)
		}
		if !strings.HasSuffix(r.URL.Path, "/botTEST/getUpdates") {
			t.Errorf("unexpected path: %s", r.URL.Path)
		}
		if r.URL.Query().Get("offset") != "7" {
			t.Errorf("offset = %q, want 7", r.URL.Query().Get("offset"))
		}
		if r.URL.Query().Get("timeout") != "30" {
			t.Errorf("timeout = %q, want 30", r.URL.Query().Get("timeout"))
		}
		w.Header().Set("Content-Type", "application/json")
		_, _ = io.WriteString(w, `{"ok":true,"result":[{"update_id":7,"message":{"message_id":99,"chat":{"id":42,"type":"private","username":"juan","first_name":"Juan"},"text":"/start"}}]}`)
	}))
	defer srv.Close()

	client := NewTelegramClient("TEST")
	client.BaseURL = srv.URL

	updates, err := client.GetUpdates(context.Background(), 7, 30)
	if err != nil {
		t.Fatalf("GetUpdates returned error: %v", err)
	}
	if len(updates) != 1 {
		t.Fatalf("len(updates) = %d, want 1", len(updates))
	}
	if updates[0].UpdateID != 7 {
		t.Errorf("UpdateID = %d, want 7", updates[0].UpdateID)
	}
	if updates[0].Message == nil {
		t.Fatal("Message is nil")
	}
	if updates[0].Message.Text != "/start" {
		t.Errorf("Text = %q, want /start", updates[0].Message.Text)
	}
	if updates[0].Message.Chat.ID != 42 {
		t.Errorf("Chat.ID = %d, want 42", updates[0].Message.Chat.ID)
	}
	if updates[0].Message.Chat.Username != "juan" {
		t.Errorf("Chat.Username = %q, want juan", updates[0].Message.Chat.Username)
	}
}

func setupHandlerEnv(t *testing.T) (*TelegramClient, *db.DB, *capture, *httptest.Server) {
	t.Helper()
	database, err := db.Init(":memory:")
	if err != nil {
		t.Fatalf("db.Init: %v", err)
	}
	t.Cleanup(func() { _ = database.Close() })

	c := &capture{}
	srv := newCaptureServer(t, c)
	t.Cleanup(srv.Close)

	client := NewTelegramClient("TEST")
	client.BaseURL = srv.URL
	return client, database, c, srv
}

func makeUpdate(id int64, chatID int64, text string) Update {
	return Update{
		UpdateID: id,
		Message: &Message{
			MessageID: id,
			Chat: Chat{
				ID:        chatID,
				Type:      "private",
				Username:  "tester",
				FirstName: "Test",
			},
			Text: text,
		},
	}
}

func TestHandleUpdateStartInvalidToken(t *testing.T) {
	client, database, c, _ := setupHandlerEnv(t)

	HandleUpdate(context.Background(), client, database, "https://crautosdb.example", makeUpdate(1, 42, "/start noexiste"))

	msgs := c.list()
	if len(msgs) != 1 {
		t.Fatalf("sent %d messages, want 1", len(msgs))
	}
	if !strings.Contains(strings.ToLower(msgs[0]), "expirado") && !strings.Contains(strings.ToLower(msgs[0]), "inválido") {
		t.Errorf("unexpected message: %q", msgs[0])
	}
}

func TestHandleUpdateStartNoToken(t *testing.T) {
	client, database, c, _ := setupHandlerEnv(t)

	HandleUpdate(context.Background(), client, database, "https://crautosdb.example", makeUpdate(2, 42, "/start"))

	msgs := c.list()
	if len(msgs) != 1 {
		t.Fatalf("sent %d messages, want 1", len(msgs))
	}
	if !strings.Contains(msgs[0], "https://crautosdb.example") {
		t.Errorf("welcome message should contain link, got: %q", msgs[0])
	}
}

func TestHandleUpdateListEmpty(t *testing.T) {
	client, database, c, _ := setupHandlerEnv(t)

	HandleUpdate(context.Background(), client, database, "https://crautosdb.example", makeUpdate(3, 42, "/list"))

	msgs := c.list()
	if len(msgs) != 1 {
		t.Fatalf("sent %d messages, want 1", len(msgs))
	}
	if !strings.Contains(strings.ToLower(msgs[0]), "no tenés alertas activas") {
		t.Errorf("unexpected message: %q", msgs[0])
	}
}

func TestHandleUpdateStop(t *testing.T) {
	client, database, c, _ := setupHandlerEnv(t)

	HandleUpdate(context.Background(), client, database, "https://crautosdb.example", makeUpdate(4, 42, "/stop"))

	msgs := c.list()
	if len(msgs) != 1 {
		t.Fatalf("sent %d messages, want 1", len(msgs))
	}
	// With no alerts the handler must still confirm nothing was active.
	if !strings.Contains(strings.ToLower(msgs[0]), "alerta") {
		t.Errorf("unexpected message: %q", msgs[0])
	}
}

func TestHandleUpdateIgnoresNonText(t *testing.T) {
	client, database, c, _ := setupHandlerEnv(t)

	// nil message
	HandleUpdate(context.Background(), client, database, "", Update{UpdateID: 1})
	// empty text
	HandleUpdate(context.Background(), client, database, "", makeUpdate(2, 42, "   "))

	if msgs := c.list(); len(msgs) != 0 {
		t.Fatalf("expected no messages sent, got %d", len(msgs))
	}
}
