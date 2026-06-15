package confluence

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

	"gitlab.zalopay.vn/fin/lending/lending-claw/internal/config"
)

// ConfluencePage holds extracted data from a Confluence page.
type ConfluencePage struct {
	ID       string
	Title    string
	Body     string // extracted from body.storage.value
	SpaceKey string
	URL      string   // _links.base + _links.webui
	Labels   []string // metadata.labels.results[].name
}

// ConfluenceClient is an HTTP client for the Confluence REST API.
type ConfluenceClient struct {
	baseURL string
	apiKey  string // Base64(username:PAT)
	client  *http.Client
}

// NewConfluenceClient creates a Confluence client with Basic auth and TLS skip verify.
func NewConfluenceClient(cfg config.ConfluenceConfig) *ConfluenceClient {
	return &ConfluenceClient{
		baseURL: strings.TrimRight(cfg.URL, "/"),
		apiKey:  cfg.APIKey,
		client: &http.Client{
			Timeout: 30 * time.Second,
			Transport: &http.Transport{
				TLSClientConfig: &tls.Config{InsecureSkipVerify: true},
			},
		},
	}
}

func (c *ConfluenceClient) doGet(ctx context.Context, reqURL string) ([]byte, error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, reqURL, nil)
	if err != nil {
		return nil, err
	}
	req.Header.Set("Authorization", "Basic "+c.apiKey)
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Accept", "application/json")

	resp, err := c.client.Do(req)
	if err != nil {
		return nil, fmt.Errorf("confluence request: %w", err)
	}
	defer resp.Body.Close()

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, fmt.Errorf("read response: %w", err)
	}

	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("confluence API %d: %s", resp.StatusCode, string(body))
	}
	return body, nil
}

// parsePage extracts a ConfluencePage from a raw Confluence API JSON response.
func parsePage(data []byte) (*ConfluencePage, error) {
	var raw struct {
		ID    string `json:"id"`
		Title string `json:"title"`
		Body  struct {
			Storage struct {
				Value string `json:"value"`
			} `json:"storage"`
		} `json:"body"`
		Space struct {
			Key string `json:"key"`
		} `json:"space"`
		Metadata struct {
			Labels struct {
				Results []struct {
					Name string `json:"name"`
				} `json:"results"`
			} `json:"labels"`
		} `json:"metadata"`
		Links struct {
			Base  string `json:"base"`
			WebUI string `json:"webui"`
		} `json:"_links"`
	}

	if err := json.Unmarshal(data, &raw); err != nil {
		return nil, fmt.Errorf("decode page: %w", err)
	}

	page := &ConfluencePage{
		ID:       raw.ID,
		Title:    raw.Title,
		Body:     raw.Body.Storage.Value,
		SpaceKey: raw.Space.Key,
	}

	if raw.Links.WebUI != "" {
		base := raw.Links.Base
		if base == "" {
			base = "https://confluence.zalopay.vn"
		}
		page.URL = base + raw.Links.WebUI
	}

	for _, l := range raw.Metadata.Labels.Results {
		if l.Name != "" {
			page.Labels = append(page.Labels, l.Name)
		}
	}

	return page, nil
}

const defaultExpand = "body.storage,metadata.labels"

// GetPageByID fetches a single Confluence page by its ID.
func (c *ConfluenceClient) GetPageByID(ctx context.Context, pageID string) (*ConfluencePage, error) {
	reqURL := fmt.Sprintf("%s/rest/api/content/%s?expand=%s", c.baseURL, pageID, defaultExpand)
	body, err := c.doGet(ctx, reqURL)
	if err != nil {
		return nil, err
	}
	return parsePage(body)
}

// GetPageByTitle finds a page by space key and title.
func (c *ConfluenceClient) GetPageByTitle(ctx context.Context, spaceKey, title string) (*ConfluencePage, error) {
	reqURL := fmt.Sprintf("%s/rest/api/content?spaceKey=%s&title=%s&expand=%s",
		c.baseURL,
		url.QueryEscape(spaceKey),
		url.QueryEscape(title),
		defaultExpand,
	)
	body, err := c.doGet(ctx, reqURL)
	if err != nil {
		return nil, err
	}

	var result struct {
		Results []json.RawMessage `json:"results"`
	}
	if err := json.Unmarshal(body, &result); err != nil {
		return nil, fmt.Errorf("decode search results: %w", err)
	}
	if len(result.Results) == 0 {
		return nil, fmt.Errorf("page not found: space=%s title=%q", spaceKey, title)
	}
	return parsePage(result.Results[0])
}

// GetChildPages returns all immediate child pages (paginated).
func (c *ConfluenceClient) GetChildPages(ctx context.Context, pageID string) ([]*ConfluencePage, error) {
	reqURL := fmt.Sprintf("%s/rest/api/content/%s/child/page?expand=%s&limit=100",
		c.baseURL, pageID, defaultExpand)

	var pages []*ConfluencePage
	for reqURL != "" {
		body, err := c.doGet(ctx, reqURL)
		if err != nil {
			return nil, err
		}

		var result struct {
			Results []json.RawMessage `json:"results"`
			Links   struct {
				Next string `json:"next"`
			} `json:"_links"`
		}
		if err := json.Unmarshal(body, &result); err != nil {
			return nil, fmt.Errorf("decode children: %w", err)
		}

		for _, raw := range result.Results {
			page, err := parsePage(raw)
			if err != nil {
				slog.WarnContext(ctx, "skip child page", "error", err)
				continue
			}
			pages = append(pages, page)
		}

		if result.Links.Next != "" {
			reqURL = c.baseURL + result.Links.Next
		} else {
			reqURL = ""
		}
	}

	return pages, nil
}

// GetAllDescendants recursively fetches all descendant pages from a root page.
func (c *ConfluenceClient) GetAllDescendants(ctx context.Context, pageID string) ([]*ConfluencePage, error) {
	var all []*ConfluencePage

	children, err := c.GetChildPages(ctx, pageID)
	if err != nil {
		return nil, err
	}

	for _, child := range children {
		// Re-fetch full page to get complete body (child listing may have it, but be safe)
		full, err := c.GetPageByID(ctx, child.ID)
		if err != nil {
			slog.WarnContext(ctx, "skip descendant page", "id", child.ID, "error", err)
			continue
		}
		all = append(all, full)

		descendants, err := c.GetAllDescendants(ctx, child.ID)
		if err != nil {
			slog.WarnContext(ctx, "error fetching descendants", "parent_id", child.ID, "error", err)
			continue
		}
		all = append(all, descendants...)
	}

	return all, nil
}
