// Package cas is a small client for Zalopay's platform CAS SSO server, used to
// validate a service ticket and resolve the authenticated user id.
package cas

import (
	"context"
	"crypto/tls"
	"encoding/json"
	"fmt"
	"io"
	"log/slog"
	"net/http"
	"net/url"
	"strings"
	"time"
)

// Client validates CAS service tickets.
type Client struct {
	baseURL string
	client  *http.Client
}

// New creates a CAS client. baseURL is the CAS server root, e.g.
// "https://platform-cas.zalopay.vn". proxyURL, when non-empty, routes all
// outbound CAS requests through that HTTP proxy (e.g. http://10.40.81.10:8088);
// an unparseable proxyURL is ignored (direct connection).
func New(baseURL, proxyURL string) *Client {
	transport := &http.Transport{
		TLSClientConfig: &tls.Config{InsecureSkipVerify: true},
	}
	if proxyURL != "" {
		if p, err := url.Parse(proxyURL); err == nil {
			transport.Proxy = http.ProxyURL(p)
		} else {
			slog.Warn("cas: invalid proxy url, using direct connection", "proxy", proxyURL, "error", err)
		}
	}
	return &Client{
		baseURL: strings.TrimRight(baseURL, "/"),
		client: &http.Client{
			Timeout:   15 * time.Second,
			Transport: transport,
		},
	}
}

// serviceValidateResponse models the JSON returned by CAS serviceValidate when
// format=json. On success authenticationSuccess.user holds the user id.
type serviceValidateResponse struct {
	AuthenticationSuccess *struct {
		User string `json:"user"`
	} `json:"authenticationSuccess"`
	AuthenticationFailure *struct {
		Code        string `json:"code"`
		Description string `json:"description"`
	} `json:"authenticationFailure"`
}

// ValidateTicket validates a CAS service ticket against the configured CAS
// server and returns the authenticated user id. service must be the exact
// service URL that was sent to CAS during the initial redirect.
func (c *Client) ValidateTicket(ctx context.Context, service, ticket string) (string, error) {
	reqURL := fmt.Sprintf("%s/sso/serviceValidate?format=json&service=%s&ticket=%s",
		c.baseURL, url.QueryEscape(service), url.QueryEscape(ticket))

	req, err := http.NewRequestWithContext(ctx, http.MethodGet, reqURL, nil)
	if err != nil {
		return "", err
	}
	req.Header.Set("Accept", "application/json")

	resp, err := c.client.Do(req)
	if err != nil {
		return "", fmt.Errorf("cas request: %w", err)
	}
	defer resp.Body.Close()

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return "", fmt.Errorf("read response: %w", err)
	}
	if resp.StatusCode != http.StatusOK {
		return "", fmt.Errorf("cas serviceValidate %d: %s", resp.StatusCode, string(body))
	}

	slog.InfoContext(ctx, "cas.serviceValidate", "response", string(body))
	var out serviceValidateResponse
	if err := json.Unmarshal(body, &out); err != nil {
		return "", fmt.Errorf("decode cas response: %w", err)
	}
	if out.AuthenticationSuccess == nil || out.AuthenticationSuccess.User == "" {
		if out.AuthenticationFailure != nil {
			return "", fmt.Errorf("cas authentication failed: %s %s",
				out.AuthenticationFailure.Code, out.AuthenticationFailure.Description)
		}
		return "", fmt.Errorf("cas authentication failed: no user in response")
	}
	return out.AuthenticationSuccess.User, nil
}
