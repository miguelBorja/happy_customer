package api

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"html"
	"log"
	"net/http"
	"net/url"
	"os"
	"strconv"
	"strings"
	"time"

	"crautosdb/alerts"
	"crautosdb/db"
)

const defaultTelegramBotUsername = "carros_usados_alertas_bot"

// HandleAlerts creates a saved-search alert subscription and returns its tokens and Telegram deep link.
func (s *Server) HandleAlerts(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	w.Header().Set("Access-Control-Allow-Origin", "*")
	w.Header().Set("Access-Control-Allow-Methods", "POST, OPTIONS")
	w.Header().Set("Access-Control-Allow-Headers", "Content-Type")

	if r.Method == http.MethodOptions {
		w.WriteHeader(http.StatusOK)
		return
	}
	if r.Method != http.MethodPost {
		respondError(w, http.StatusMethodNotAllowed, "Method not allowed")
		return
	}

	var body struct {
		Channel string `json:"channel"`
		Query   string `json:"query"`
		Label   string `json:"label"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		respondError(w, http.StatusBadRequest, "Invalid JSON body")
		return
	}

	query := strings.TrimSpace(body.Query)
	if query == "" {
		respondError(w, http.StatusBadRequest, "query is required")
		return
	}
	if len(query) > 4000 {
		respondError(w, http.StatusBadRequest, "query is too long")
		return
	}

	sub, err := s.DB.CreateAlertSubscription("telegram", query, strings.TrimSpace(body.Label))
	if err != nil {
		log.Printf("[API ERROR] CreateAlertSubscription failed: %v", err)
		respondError(w, http.StatusInternalServerError, "Failed to create alert")
		return
	}

	botUsername := strings.TrimSpace(os.Getenv("TELEGRAM_BOT_USERNAME"))
	if botUsername == "" {
		botUsername = defaultTelegramBotUsername
	}
	telegramURL := fmt.Sprintf("https://t.me/%s?start=%s", botUsername, sub.ConnectToken)

	_ = json.NewEncoder(w).Encode(map[string]interface{}{
		"connectToken":     sub.ConnectToken,
		"unsubscribeToken": sub.UnsubscribeToken,
		"telegramUrl":      telegramURL,
	})
}

// HandleAlertStatus reports whether a subscription (looked up by connect token) is active.
func (s *Server) HandleAlertStatus(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	w.Header().Set("Access-Control-Allow-Origin", "*")
	w.Header().Set("Access-Control-Allow-Methods", "GET, OPTIONS")
	w.Header().Set("Access-Control-Allow-Headers", "Content-Type")

	if r.Method == http.MethodOptions {
		w.WriteHeader(http.StatusOK)
		return
	}

	token := strings.TrimSpace(r.URL.Query().Get("token"))
	if token == "" {
		respondError(w, http.StatusBadRequest, "token is required")
		return
	}

	sub, err := s.DB.GetAlertByConnectToken(token)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			w.WriteHeader(http.StatusNotFound)
			_ = json.NewEncoder(w).Encode(map[string]interface{}{"active": false})
			return
		}
		log.Printf("[API ERROR] GetAlertByConnectToken failed: %v", err)
		respondError(w, http.StatusInternalServerError, "Failed to load alert")
		return
	}

	_ = json.NewEncoder(w).Encode(map[string]interface{}{"active": sub.Active})
}

// HandleAlertUnsubscribe deactivates a subscription and renders a confirmation page.
func (s *Server) HandleAlertUnsubscribe(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "text/html; charset=utf-8")

	token := strings.TrimSpace(r.URL.Query().Get("token"))
	if token != "" {
		if _, err := s.DB.DeactivateAlertByUnsubscribeToken(token); err != nil {
			log.Printf("[API ERROR] DeactivateAlertByUnsubscribeToken failed: %v", err)
		}
	}

	_, _ = w.Write([]byte(`<!doctype html>
<html lang="es">
<head><meta charset="utf-8"><title>Alertas desactivadas</title></head>
<body style="font-family:sans-serif;text-align:center;padding:3rem">
<h1>Alertas desactivadas</h1>
<p>Ya no recibirás más notificaciones de esta búsqueda.</p>
</body>
</html>`))
}

// HandleTelegramWebhook receives Telegram updates and dispatches them to command handlers.
func (s *Server) HandleTelegramWebhook(w http.ResponseWriter, r *http.Request) {
	if r.Method == http.MethodOptions {
		w.WriteHeader(http.StatusOK)
		return
	}

	if secret := strings.TrimSpace(os.Getenv("TELEGRAM_WEBHOOK_SECRET")); secret != "" {
		if r.Header.Get("X-Telegram-Bot-Api-Secret-Token") != secret {
			w.WriteHeader(http.StatusUnauthorized)
			return
		}
	}

	var upd alerts.Update
	if err := json.NewDecoder(r.Body).Decode(&upd); err != nil {
		w.WriteHeader(http.StatusOK)
		return
	}

	if token := strings.TrimSpace(os.Getenv("TELEGRAM_BOT_TOKEN")); token != "" {
		client := alerts.NewTelegramClient(token)
		alerts.HandleUpdate(r.Context(), client, s.DB, os.Getenv("PUBLIC_BASE_URL"), upd)
	}

	w.WriteHeader(http.StatusOK)
}

// RunAlertsDigest evaluates every active Telegram alert and notifies subscribers with new
// listings and price drops since their last notification.
func (s *Server) RunAlertsDigest(ctx context.Context, client *alerts.TelegramClient, publicBaseURL string) error {
	subs, err := s.DB.ListActiveAlerts("telegram")
	if err != nil {
		return err
	}

	stats := s.getMarketStats()
	now := time.Now()

	for _, sub := range subs {
		since := sub.LastNotifiedAt
		if since.IsZero() {
			since = now.Add(-24 * time.Hour)
		}

		watchedURLs := db.ParseAlertCarURLs(sub.Query)
		if len(watchedURLs) > 0 {
			s.runCarWatchAlert(ctx, client, stats, sub, watchedURLs, since, now, publicBaseURL)
			continue
		}

		matches, err := s.EvaluateSavedSearch(stats, sub.Query, since, now)
		if err != nil {
			log.Printf("[ALERTS] EvaluateSavedSearch (alert %d) failed: %v", sub.ID, err)
			continue
		}

		if len(matches.NewURLs) == 0 && len(matches.DropURLs) == 0 {
			_ = s.DB.UpdateAlertNotifiedAt(sub.ID, now)
			continue
		}

		newURLs := matches.NewURLs
		if len(newURLs) > 5 {
			newURLs = newURLs[:5]
		}
		dropURLs := matches.DropURLs
		if len(dropURLs) > 5 {
			dropURLs = dropURLs[:5]
		}

		allURLs := make([]string, 0, len(newURLs)+len(dropURLs))
		allURLs = append(allURLs, newURLs...)
		allURLs = append(allURLs, dropURLs...)

		carsByURL := make(map[string]db.Car, len(allURLs))
		if cars, err := s.DB.GetCarsByURLs(allURLs); err == nil {
			for _, c := range cars {
				carsByURL[c.URL] = c
			}
		} else {
			log.Printf("[ALERTS] GetCarsByURLs (alert %d) failed: %v", sub.ID, err)
		}

		msg := buildAlertMessage(sub, newURLs, dropURLs, carsByURL, publicBaseURL)
		if err := client.SendMessage(ctx, sub.Target, msg); err != nil {
			log.Printf("[ALERTS] SendMessage (alert %d) failed: %v", sub.ID, err)
			continue
		}

		if err := s.DB.UpdateAlertNotifiedAt(sub.ID, now); err != nil {
			log.Printf("[ALERTS] UpdateAlertNotifiedAt (alert %d) failed: %v", sub.ID, err)
		}
	}

	return nil
}

// carDropEvent captures a watched car whose price dropped since the last notification.
type carDropEvent struct {
	Car       db.Car
	PrevPrice int
	DropUSD   int
	DropPct   float64
}

// runCarWatchAlert notifies a subscriber about price drops and sold status for a per-car /
// favorites alert (a query carrying explicit car URLs rather than a saved-search filter).
func (s *Server) runCarWatchAlert(ctx context.Context, client *alerts.TelegramClient, stats *db.MarketIndex, sub db.AlertSubscription, watchedURLs []string, since, now time.Time, publicBaseURL string) {
	cars, err := s.DB.GetCarsByURLs(watchedURLs)
	if err != nil {
		log.Printf("[ALERTS] GetCarsByURLs (alert %d) failed: %v", sub.ID, err)
		return
	}

	carsByURL := make(map[string]db.Car, len(cars))
	for _, c := range cars {
		carsByURL[c.URL] = c
	}

	var (
		drops      []carDropEvent
		soldCars   []db.Car
		foundCount int
		soldTotal  int
	)

	for _, u := range watchedURLs {
		car, ok := carsByURL[u]
		if !ok {
			continue
		}
		foundCount++

		if car.IsSold {
			soldTotal++
			soldAt := car.LastSeenAt
			if car.SoldAt != nil && !car.SoldAt.IsZero() {
				soldAt = *car.SoldAt
			}
			if !soldAt.IsZero() && soldAt.After(since) {
				soldCars = append(soldCars, car)
			}
			continue
		}

		if stats != nil {
			k := db.CarPriceKey{
				URL:          car.URL,
				Brand:        car.Brand,
				Model:        car.Model,
				Year:         car.Year,
				Price:        car.Price,
				Km:           car.Kilometraje,
				ScrapedAt:    car.ScrapedAt,
				FechaIngreso: car.FechaIngreso,
				IsSold:       car.IsSold,
			}
			dropUSD, dropPct, changedAt, ok := qualifyingPriceDrop(stats, k)
			if ok && !changedAt.IsZero() && changedAt.After(since) {
				drops = append(drops, carDropEvent{
					Car:       car,
					PrevPrice: car.Price + dropUSD,
					DropUSD:   dropUSD,
					DropPct:   dropPct,
				})
			}
		}
	}

	if len(drops) == 0 && len(soldCars) == 0 {
		_ = s.DB.UpdateAlertNotifiedAt(sub.ID, now)
		return
	}

	msg := buildCarWatchAlertMessage(sub, watchedURLs, drops, soldCars, publicBaseURL)
	if err := client.SendMessage(ctx, sub.Target, msg); err != nil {
		log.Printf("[ALERTS] SendMessage (alert %d) failed: %v", sub.ID, err)
		return
	}

	if err := s.DB.UpdateAlertNotifiedAt(sub.ID, now); err != nil {
		log.Printf("[ALERTS] UpdateAlertNotifiedAt (alert %d) failed: %v", sub.ID, err)
	}

	if len(soldCars) > 0 && foundCount > 0 && soldTotal == foundCount {
		if err := s.DB.DeactivateAlertByID(sub.ID); err != nil {
			log.Printf("[ALERTS] DeactivateAlertByID (alert %d) failed: %v", sub.ID, err)
		}
	}
}

// formatAlertUSD renders an integer amount as a dollar figure with thousands separators.
func formatAlertUSD(amount int) string {
	sign := ""
	if amount < 0 {
		sign = "-"
		amount = -amount
	}
	s := strconv.Itoa(amount)
	var b strings.Builder
	for i, ch := range s {
		if i > 0 && (len(s)-i)%3 == 0 {
			b.WriteByte(',')
		}
		b.WriteRune(ch)
	}
	return sign + "$" + b.String()
}

// buildCarWatchAlertMessage renders the Telegram message for a per-car / favorites alert.
func buildCarWatchAlertMessage(sub db.AlertSubscription, watchedURLs []string, drops []carDropEvent, soldCars []db.Car, publicBaseURL string) string {
	var b strings.Builder

	label := strings.TrimSpace(sub.Label)
	if label == "" {
		label = "Alerta de precio"
	}
	fmt.Fprintf(&b, "<b>%s</b>\n\n", html.EscapeString(label))

	if len(drops) > 0 {
		b.WriteString("<b>📉 Bajada de precio</b>\n")
		for _, ev := range drops {
			title := alertCarTitle(ev.Car)
			line := fmt.Sprintf(`<a href="%s">%s</a>`, html.EscapeString(alertCarLink(ev.Car, publicBaseURL)), html.EscapeString(title))

			var parts []string
			if ev.Car.Year > 0 {
				parts = append(parts, fmt.Sprintf("%d", ev.Car.Year))
			}
			if ev.Car.Kilometraje > 0 {
				parts = append(parts, fmt.Sprintf("%d km", ev.Car.Kilometraje))
			}
			if len(parts) > 0 {
				line += " — " + strings.Join(parts, " · ")
			}

			b.WriteString("• " + line + "\n")
			fmt.Fprintf(&b, "   %s → <b>%s</b> (-%s / -%.1f%%)\n",
				formatAlertUSD(ev.PrevPrice), formatAlertUSD(ev.Car.Price), formatAlertUSD(ev.DropUSD), ev.DropPct)
		}
		b.WriteString("\n")
	}

	if len(soldCars) > 0 {
		b.WriteString("<b>🏷️ Marcado como vendido</b>\n")
		for _, car := range soldCars {
			title := alertCarTitle(car)
			line := fmt.Sprintf(`• <a href="%s">%s</a>`, html.EscapeString(alertCarLink(car, publicBaseURL)), html.EscapeString(title))
			if car.Year > 0 {
				line += fmt.Sprintf(" — %d", car.Year)
			}
			line += " — Vendido\n"
			b.WriteString(line)
		}
		b.WriteString("\n")
	}

	if base := strings.TrimRight(strings.TrimSpace(publicBaseURL), "/"); base != "" {
		if len(watchedURLs) == 1 {
			fmt.Fprintf(&b, `<a href="%s/?car=%s">Ver auto</a>`+"\n", html.EscapeString(base), html.EscapeString(url.QueryEscape(watchedURLs[0])))
		} else {
			fmt.Fprintf(&b, `<a href="%s/?tab=favorites">Ver favoritos</a>`+"\n", html.EscapeString(base))
		}
		fmt.Fprintf(&b, `<a href="%s/api/alerts/unsubscribe?token=%s">Desuscribirse</a>`+"\n", html.EscapeString(base), html.EscapeString(sub.UnsubscribeToken))
	}

	b.WriteString("/stop para cancelar alertas")
	return b.String()
}

func alertCarTitle(car db.Car) string {
	if title := strings.TrimSpace(car.Title); title != "" {
		return title
	}
	if title := strings.TrimSpace(car.Brand + " " + car.Model); title != "" {
		return title
	}
	return car.URL
}

func alertCarLink(car db.Car, publicBaseURL string) string {
	if base := strings.TrimRight(strings.TrimSpace(publicBaseURL), "/"); base != "" {
		return base + "/?car=" + url.QueryEscape(car.URL)
	}
	return car.URL
}

func formatAlertCar(car db.Car, publicBaseURL string) string {
	title := alertCarTitle(car)
	line := fmt.Sprintf(`<a href="%s">%s</a>`, html.EscapeString(alertCarLink(car, publicBaseURL)), html.EscapeString(title))

	var parts []string
	if car.Year > 0 {
		parts = append(parts, fmt.Sprintf("%d", car.Year))
	}
	if car.Price > 0 {
		parts = append(parts, fmt.Sprintf("USD %d", car.Price))
	}
	if car.Kilometraje > 0 {
		parts = append(parts, fmt.Sprintf("%d km", car.Kilometraje))
	}
	if len(parts) > 0 {
		line += " — " + strings.Join(parts, " · ")
	}
	return line
}

func buildAlertMessage(sub db.AlertSubscription, newURLs, dropURLs []string, carsByURL map[string]db.Car, publicBaseURL string) string {
	var b strings.Builder

	label := strings.TrimSpace(sub.Label)
	if label == "" {
		label = strings.TrimSpace(sub.Query)
	}
	fmt.Fprintf(&b, "<b>%s</b>\n\n", html.EscapeString(label))

	writeCarList := func(header string, urls []string) {
		if len(urls) == 0 {
			return
		}
		b.WriteString("<b>" + header + "</b>\n")
		for _, u := range urls {
			if car, ok := carsByURL[u]; ok {
				b.WriteString("• " + formatAlertCar(car, publicBaseURL) + "\n")
			} else {
				b.WriteString("• " + html.EscapeString(u) + "\n")
			}
		}
		b.WriteString("\n")
	}

	writeCarList("Nuevos anuncios", newURLs)
	writeCarList("Bajadas de precio", dropURLs)

	base := strings.TrimRight(strings.TrimSpace(publicBaseURL), "/")
	if base != "" {
		query := strings.TrimPrefix(strings.TrimSpace(sub.Query), "?")
		fmt.Fprintf(&b, `<a href="%s/?%s">Ver todos</a>`+"\n", html.EscapeString(base), html.EscapeString(query))
		fmt.Fprintf(&b, `<a href="%s/api/alerts/unsubscribe?token=%s">Desuscribirse</a>`+"\n", html.EscapeString(base), html.EscapeString(sub.UnsubscribeToken))
	}

	b.WriteString("/stop para cancelar alertas")
	return b.String()
}

// StartTelegramPolling long-polls the Telegram Bot API until ctx is cancelled.
func StartTelegramPolling(ctx context.Context, client *alerts.TelegramClient, database *db.DB, publicBaseURL string) {
	var offset int64
	for {
		select {
		case <-ctx.Done():
			return
		default:
		}

		updates, err := client.GetUpdates(ctx, offset, 25)
		if err != nil {
			if ctx.Err() != nil {
				return
			}
			log.Printf("[ALERTS] Telegram getUpdates failed: %v", err)
			select {
			case <-ctx.Done():
				return
			case <-time.After(5 * time.Second):
			}
			continue
		}

		for _, upd := range updates {
			alerts.HandleUpdate(ctx, client, database, publicBaseURL, upd)
			offset = upd.UpdateID + 1
		}
	}
}
