// Package alerts provides a Telegram Bot API client and command handlers used to
// manage CrautosDB alerts directly from Telegram chats.
package alerts

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"html"
	"io"
	"net/http"
	"strconv"
	"strings"
	"time"

	"crautosdb/db"
)

const defaultTelegramBaseURL = "https://api.telegram.org"

// TelegramClient is a minimal Telegram Bot API client.
type TelegramClient struct {
	Token      string
	BaseURL    string
	HTTPClient *http.Client
}

// NewTelegramClient returns a TelegramClient using the given bot token.
func NewTelegramClient(token string) *TelegramClient {
	return &TelegramClient{
		Token:      token,
		BaseURL:    defaultTelegramBaseURL,
		HTTPClient: &http.Client{Timeout: 45 * time.Second},
	}
}

func (c *TelegramClient) baseURL() string {
	if c.BaseURL == "" {
		return defaultTelegramBaseURL
	}
	return c.BaseURL
}

func (c *TelegramClient) httpClient() *http.Client {
	if c.HTTPClient == nil {
		return &http.Client{Timeout: 15 * time.Second}
	}
	return c.HTTPClient
}

// Update is a Telegram Bot API update.
type Update struct {
	UpdateID int64    `json:"update_id"`
	Message  *Message `json:"message,omitempty"`
}

// Message is a Telegram chat message.
type Message struct {
	MessageID int64  `json:"message_id"`
	Chat      Chat   `json:"chat"`
	Text      string `json:"text"`
}

// Chat identifies the chat a message belongs to.
type Chat struct {
	ID        int64  `json:"id"`
	Type      string `json:"type"`
	Username  string `json:"username"`
	FirstName string `json:"first_name"`
}

type sendMessageRequest struct {
	ChatID                string `json:"chat_id"`
	Text                  string `json:"text"`
	ParseMode             string `json:"parse_mode"`
	DisableWebPagePreview bool   `json:"disable_web_page_preview"`
}

type apiResponse struct {
	OK          bool   `json:"ok"`
	Description string `json:"description"`
}

// SendMessage sends an HTML-formatted message to chatID.
func (c *TelegramClient) SendMessage(ctx context.Context, chatID string, htmlText string) error {
	endpoint := fmt.Sprintf("%s/bot%s/sendMessage", c.baseURL(), c.Token)

	payload, err := json.Marshal(sendMessageRequest{
		ChatID:                chatID,
		Text:                  htmlText,
		ParseMode:             "HTML",
		DisableWebPagePreview: true,
	})
	if err != nil {
		return fmt.Errorf("marshal sendMessage: %w", err)
	}

	req, err := http.NewRequestWithContext(ctx, http.MethodPost, endpoint, bytes.NewReader(payload))
	if err != nil {
		return fmt.Errorf("new sendMessage request: %w", err)
	}
	req.Header.Set("Content-Type", "application/json")

	resp, err := c.httpClient().Do(req)
	if err != nil {
		return fmt.Errorf("sendMessage: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode < http.StatusOK || resp.StatusCode >= http.StatusMultipleChoices {
		body, _ := io.ReadAll(resp.Body)
		return fmt.Errorf("telegram sendMessage status %d: %s", resp.StatusCode, strings.TrimSpace(string(body)))
	}

	var out apiResponse
	if err := json.NewDecoder(resp.Body).Decode(&out); err != nil {
		return fmt.Errorf("decode sendMessage response: %w", err)
	}
	if !out.OK {
		return fmt.Errorf("telegram sendMessage not ok: %s", out.Description)
	}
	return nil
}

// GetUpdates long-polls the Bot API for new updates starting at offset.
func (c *TelegramClient) GetUpdates(ctx context.Context, offset int64, timeoutSec int) ([]Update, error) {
	endpoint := fmt.Sprintf("%s/bot%s/getUpdates?offset=%d&timeout=%d", c.baseURL(), c.Token, offset, timeoutSec)

	req, err := http.NewRequestWithContext(ctx, http.MethodGet, endpoint, nil)
	if err != nil {
		return nil, fmt.Errorf("new getUpdates request: %w", err)
	}

	client := c.httpClient()
	if timeoutSec > 0 && client.Timeout > 0 && client.Timeout <= time.Duration(timeoutSec)*time.Second {
		cloned := *client
		cloned.Timeout = time.Duration(timeoutSec+10) * time.Second
		client = &cloned
	}

	resp, err := client.Do(req)
	if err != nil {
		msg := err.Error()
		if c.Token != "" {
			msg = strings.ReplaceAll(msg, c.Token, "<redacted>")
		}
		return nil, fmt.Errorf("getUpdates: %s", msg)
	}
	defer resp.Body.Close()

	if resp.StatusCode < http.StatusOK || resp.StatusCode >= http.StatusMultipleChoices {
		body, _ := io.ReadAll(resp.Body)
		return nil, fmt.Errorf("telegram getUpdates status %d: %s", resp.StatusCode, strings.TrimSpace(string(body)))
	}

	var out struct {
		OK          bool     `json:"ok"`
		Result      []Update `json:"result"`
		Description string   `json:"description"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&out); err != nil {
		return nil, fmt.Errorf("decode getUpdates response: %w", err)
	}
	if !out.OK {
		return nil, fmt.Errorf("telegram getUpdates not ok: %s", out.Description)
	}
	return out.Result, nil
}

// SetWebhook registers webhookURL (with an optional secret token) for the bot.
func (c *TelegramClient) SetWebhook(ctx context.Context, webhookURL, secretToken string) error {
	endpoint := fmt.Sprintf("%s/bot%s/setWebhook", c.baseURL(), c.Token)

	body := map[string]string{"url": webhookURL}
	if secretToken != "" {
		body["secret_token"] = secretToken
	}
	payload, err := json.Marshal(body)
	if err != nil {
		return fmt.Errorf("marshal setWebhook: %w", err)
	}

	req, err := http.NewRequestWithContext(ctx, http.MethodPost, endpoint, bytes.NewReader(payload))
	if err != nil {
		return fmt.Errorf("new setWebhook request: %w", err)
	}
	req.Header.Set("Content-Type", "application/json")

	resp, err := c.httpClient().Do(req)
	if err != nil {
		return fmt.Errorf("setWebhook: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode < http.StatusOK || resp.StatusCode >= http.StatusMultipleChoices {
		respBody, _ := io.ReadAll(resp.Body)
		return fmt.Errorf("telegram setWebhook status %d: %s", resp.StatusCode, strings.TrimSpace(string(respBody)))
	}

	var out apiResponse
	if err := json.NewDecoder(resp.Body).Decode(&out); err != nil {
		return fmt.Errorf("decode setWebhook response: %w", err)
	}
	if !out.OK {
		return fmt.Errorf("telegram setWebhook not ok: %s", out.Description)
	}
	return nil
}

// HandleUpdate dispatches a single Telegram update to the matching command handler.
func HandleUpdate(ctx context.Context, client *TelegramClient, database *db.DB, publicBaseURL string, upd Update) {
	if upd.Message == nil || strings.TrimSpace(upd.Message.Text) == "" {
		return
	}

	chatID := strconv.FormatInt(upd.Message.Chat.ID, 10)
	fields := strings.Fields(strings.TrimSpace(upd.Message.Text))
	if len(fields) == 0 {
		return
	}

	command := stripBotMention(fields[0])

	switch command {
	case "/start":
		handleStart(ctx, client, database, publicBaseURL, chatID, fields)
	case "/list":
		handleList(ctx, client, database, chatID)
	case "/stop":
		handleStop(ctx, client, database, chatID)
	}
}

func handleStart(ctx context.Context, client *TelegramClient, database *db.DB, publicBaseURL, chatID string, fields []string) {
	// /start <token>
	if len(fields) > 1 {
		token := stripBotMention(fields[1])
		sub, err := database.ActivateTelegramAlert(token, chatID)
		if err != nil {
			_ = client.SendMessage(ctx, chatID,
				"❌ El enlace ha expirado o no es válido. Por favor generá una nueva alerta desde la web.")
			return
		}
		isCarWatch := len(db.ParseAlertCarURLs(sub.Query)) > 0
		label := sub.Label
		if strings.TrimSpace(label) == "" {
			if isCarWatch {
				label = "Auto guardado"
			} else {
				label = "Búsqueda personalizada"
			}
		}
		var msg string
		if isCarWatch {
			msg = fmt.Sprintf(
				"✅ ¡Alerta de precio activada!\n\n"+
					"Te avisaremos cuando baje de precio o se marque como vendido: <b>%s</b>.\n\n"+
					"Usá /list para ver tus alertas y /stop para desactivarlas.",
				html.EscapeString(label),
			)
		} else {
			msg = fmt.Sprintf(
				"✅ ¡Alerta activada!\n\n"+
					"Recibirás actualizaciones diarias con las nuevas publicaciones y bajadas de precio de: <b>%s</b>.\n\n"+
					"Usá /list para ver tus alertas y /stop para desactivarlas.",
				html.EscapeString(label),
			)
		}
		_ = client.SendMessage(ctx, chatID, msg)
		return
	}

	// /start (no token)
	base := publicBaseURL
	if strings.TrimSpace(base) == "" {
		base = "https://crautosdb"
	}
	msg := fmt.Sprintf(
		"👋 ¡Bienvenido a <b>CrautosDB Alertas</b>!\n\n"+
			"Creá tus alertas en %s y activalas acá desde Telegram.\n\n"+
			"Comandos: /list, /stop",
		html.EscapeString(base),
	)
	_ = client.SendMessage(ctx, chatID, msg)
}

func handleList(ctx context.Context, client *TelegramClient, database *db.DB, chatID string) {
	subs, err := database.ListAlertsByTarget("telegram", chatID)
	if err != nil || len(subs) == 0 {
		_ = client.SendMessage(ctx, chatID, "No tenés alertas activas en este momento.")
		return
	}

	var sb strings.Builder
	sb.WriteString("📋 <b>Tus alertas activas:</b>")
	for _, sub := range subs {
		label := sub.Label
		if strings.TrimSpace(label) == "" {
			label = sub.Query
		}
		sb.WriteString("\n\n• ")
		sb.WriteString(html.EscapeString(label))
	}
	_ = client.SendMessage(ctx, chatID, sb.String())
}

func handleStop(ctx context.Context, client *TelegramClient, database *db.DB, chatID string) {
	count, err := database.DeactivateAlertsByTarget("telegram", chatID)
	if err != nil {
		_ = client.SendMessage(ctx, chatID, "Ocurrió un error al desactivar tus alertas. Intentá de nuevo más tarde.")
		return
	}

	var msg string
	if count == 0 {
		msg = "No tenías alertas activas para desactivar."
	} else {
		msg = fmt.Sprintf("🔕 Listo, desactivé %d alerta(s). Ya no recibirás más notificaciones.", count)
	}
	_ = client.SendMessage(ctx, chatID, msg)
}

// stripBotMention removes a trailing "@botname" from a command or token.
func stripBotMention(s string) string {
	if i := strings.Index(s, "@"); i >= 0 {
		return s[:i]
	}
	return s
}
