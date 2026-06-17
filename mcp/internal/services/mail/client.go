package mail

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"time"

	"gitlab.zalopay.vn/fin/lending/lending-claw-mcp/internal/config"
)

const resendEndpoint = "https://api.resend.com/emails"

// Client is an HTTP client for the Resend transactional email API.
type Client struct {
	apiKey     string
	from       string
	httpClient *http.Client
}

// NewClient creates a Resend mail client from config.
func NewClient(cfg config.MailConfig) *Client {
	return &Client{
		apiKey:     cfg.ResendAPIKey,
		from:       cfg.FromEmail,
		httpClient: &http.Client{Timeout: 30 * time.Second},
	}
}

// SendParams describes a single outbound email.
type SendParams struct {
	To      []string
	Cc      []string
	Bcc     []string
	Subject string
	HTML    string
	Text    string
}

// Send delivers an email via Resend and returns the created message ID.
func (c *Client) Send(ctx context.Context, p SendParams) (string, error) {
	from := c.from
	if from == "" {
		return "", fmt.Errorf("no sender: set mail.from_email in config")
	}
	if len(p.To) == 0 {
		return "", fmt.Errorf("at least one recipient is required")
	}
	if p.HTML == "" && p.Text == "" {
		return "", fmt.Errorf("email body is empty: provide html or text")
	}

	payload := map[string]any{
		"from":    from,
		"to":      p.To,
		"subject": p.Subject,
	}
	if len(p.Cc) > 0 {
		payload["cc"] = p.Cc
	}
	if len(p.Bcc) > 0 {
		payload["bcc"] = p.Bcc
	}
	if p.HTML != "" {
		payload["html"] = p.HTML
	}
	if p.Text != "" {
		payload["text"] = p.Text
	}

	body, err := json.Marshal(payload)
	if err != nil {
		return "", fmt.Errorf("marshal request: %w", err)
	}

	req, err := http.NewRequestWithContext(ctx, http.MethodPost, resendEndpoint, bytes.NewReader(body))
	if err != nil {
		return "", err
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", "Bearer "+c.apiKey)

	resp, err := c.httpClient.Do(req)
	if err != nil {
		return "", fmt.Errorf("resend request: %w", err)
	}
	defer resp.Body.Close()

	respBody, _ := io.ReadAll(resp.Body)
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return "", fmt.Errorf("resend HTTP %d: %s", resp.StatusCode, string(respBody))
	}

	var out struct {
		ID string `json:"id"`
	}
	if err := json.Unmarshal(respBody, &out); err != nil {
		return "", fmt.Errorf("decode resend response: %w", err)
	}
	return out.ID, nil
}
