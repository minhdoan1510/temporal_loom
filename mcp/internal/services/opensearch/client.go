package opensearch

import (
	"bytes"
	"context"
	"crypto/tls"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"slices"
	"strings"
	"time"

	"gitlab.zalopay.vn/fin/lending/lending-claw-mcp/internal/config"
)

// LogEntry is a parsed log entry from OpenSearch.
type LogEntry struct {
	Timestamp   string                 `json:"timestamp"`
	TraceID     string                 `json:"trace_id"`
	SpanID      string                 `json:"span_id"`
	Level       string                 `json:"level"`
	Message     string                 `json:"message"`
	Error       string                 `json:"error,omitempty"`
	ServiceName string                 `json:"service_name,omitempty"`
	Extra       map[string]interface{} `json:"extra,omitempty"`
}

// OpenSearchClient is an HTTP client for the OpenSearch REST API.
type OpenSearchClient struct {
	host       string
	port       int
	user       string
	password   string
	index      string
	httpClient *http.Client
}

// NewOpenSearchClient creates an OpenSearch client from config.
func NewOpenSearchClient(cfg config.OpenSearchConfig) *OpenSearchClient {
	return &OpenSearchClient{
		host:     cfg.Host,
		port:     cfg.Port,
		user:     cfg.User,
		password: cfg.Password,
		index:    cfg.Index,
		httpClient: &http.Client{
			Timeout: 30 * time.Second,
			Transport: &http.Transport{
				TLSClientConfig: &tls.Config{InsecureSkipVerify: true},
			},
		},
	}
}

// SearchHTTPErrors searches for HTTP error logs matching a user ID within a time range.
func (c *OpenSearchClient) SearchHTTPErrors(ctx context.Context, userID, eventTime string, hoursDelta int) ([]LogEntry, error) {
	if hoursDelta <= 0 {
		hoursDelta = 24
	}

	timeRange, err := buildTimeRange(eventTime, hoursDelta)
	if err != nil {
		return nil, err
	}

	phrases := []string{userID, "error", "component http"}
	query := c.buildPhraseQuery(phrases, timeRange, 50)

	return c.search(ctx, query)
}

// SearchByTraceID searches for logs matching a trace ID within a time range.
func (c *OpenSearchClient) SearchByTraceID(ctx context.Context, traceID, eventTime string, hoursDelta int) ([]LogEntry, error) {
	if hoursDelta <= 0 {
		hoursDelta = 24
	}

	timeRange, err := buildTimeRange(eventTime, hoursDelta)
	if err != nil {
		return nil, err
	}

	phrases := []string{traceID}
	query := c.buildPhraseQuery(phrases, timeRange, 100)

	return c.search(ctx, query)
}

// SearchActivityLog searches for activity-component logs of a specific loan application.
func (c *OpenSearchClient) SearchActivityLog(ctx context.Context, loanAppID, eventTime string, hoursDelta int) ([]LogEntry, error) {
	if hoursDelta <= 0 {
		hoursDelta = 24
	}

	timeRange, err := buildTimeRange(eventTime, hoursDelta)
	if err != nil {
		return nil, err
	}

	phrases := []string{"component activity", loanAppID}
	query := c.buildPhraseQuery(phrases, timeRange, 50)

	return c.search(ctx, query)
}

// SearchAPIInfo searches for HTTP logs of a specific API method called for a user.
func (c *OpenSearchClient) SearchAPIInfo(ctx context.Context, method, userID, eventTime string, hoursDelta int) ([]LogEntry, error) {
	if hoursDelta <= 0 {
		hoursDelta = 24
	}

	timeRange, err := buildTimeRange(eventTime, hoursDelta)
	if err != nil {
		return nil, err
	}

	phrases := []string{method, "component http", userID}
	query := c.buildPhraseQuery(phrases, timeRange, 50)

	return c.search(ctx, query)
}

func (c *OpenSearchClient) search(ctx context.Context, query map[string]interface{}) ([]LogEntry, error) {
	bodyJSON, err := json.Marshal(query)
	if err != nil {
		return nil, fmt.Errorf("marshal query: %w", err)
	}

	url := fmt.Sprintf("https://%s:%d/%s/_search", c.host, c.port, c.index)
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, url, bytes.NewReader(bodyJSON))
	if err != nil {
		return nil, err
	}
	req.Header.Set("Content-Type", "application/json")
	req.SetBasicAuth(c.user, c.password)

	resp, err := c.httpClient.Do(req)
	if err != nil {
		return nil, fmt.Errorf("opensearch request: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(resp.Body)
		return nil, fmt.Errorf("opensearch HTTP %d: %s", resp.StatusCode, string(body))
	}

	var searchResp struct {
		Hits struct {
			Total struct {
				Value int `json:"value"`
			} `json:"total"`
			Hits []struct {
				Source map[string]interface{} `json:"_source"`
			} `json:"hits"`
		} `json:"hits"`
	}

	if err := json.NewDecoder(resp.Body).Decode(&searchResp); err != nil {
		return nil, fmt.Errorf("decode opensearch response: %w", err)
	}

	var entries []LogEntry
	for _, hit := range searchResp.Hits.Hits {
		entry := parseLogEntry(hit.Source)
		entries = append(entries, entry)
	}

	return entries, nil
}

// buildPhraseQuery builds an OpenSearch query with AND-combined phrase matches and time range.
func (c *OpenSearchClient) buildPhraseQuery(phrases []string, timeRange map[string]interface{}, size int) map[string]interface{} {
	var musts []map[string]interface{}

	for _, phrase := range phrases {
		musts = append(musts, map[string]interface{}{
			"multi_match": map[string]interface{}{
				"query": phrase,
				"type":  "phrase",
				"fields": []string{
					"message",
					"msg",
					"log",
				},
			},
		})
	}

	// Time range filter
	musts = append(musts, map[string]interface{}{
		"range": map[string]interface{}{
			"@timestamp": timeRange,
		},
	})

	return map[string]interface{}{
		"size": size,
		"query": map[string]interface{}{
			"bool": map[string]interface{}{
				"must": musts,
			},
		},
		"sort": []map[string]interface{}{
			{"@timestamp": map[string]string{"order": "desc"}},
		},
	}
}

// parseLogEntry extracts structured log fields from an OpenSearch document.
func parseLogEntry(source map[string]interface{}) LogEntry {
	entry := LogEntry{}

	// Timestamp
	if v, ok := source["@timestamp"].(string); ok {
		entry.Timestamp = v
	}

	// Try to parse structured message JSON
	msgStr, _ := source["message"].(string)
	if msgStr == "" {
		msgStr, _ = source["msg"].(string)
	}

	if msgStr != "" {
		// Try parsing as JSON (many Go services emit structured JSON logs)
		var msgObj map[string]interface{}
		if json.Unmarshal([]byte(msgStr), &msgObj) == nil {
			if v, ok := msgObj["ts"].(string); ok && entry.Timestamp == "" {
				entry.Timestamp = v
			}
			if v, ok := msgObj["trace.id"].(string); ok {
				entry.TraceID = v
			}
			if v, ok := msgObj["span.id"].(string); ok {
				entry.SpanID = v
			}
			if v, ok := msgObj["level"].(string); ok {
				entry.Level = v
			}
			if v, ok := msgObj["msg"].(string); ok {
				entry.Message = truncate(v, 512)
			}
			if v, ok := msgObj["error"].(string); ok {
				entry.Error = truncate(v, 512)
			}
			if v, ok := msgObj["err"].(string); ok && entry.Error == "" {
				entry.Error = truncate(v, 512)
			}
			if v, ok := msgObj["service.name"].(string); ok {
				entry.ServiceName = v
			}

			// exclude current fields
			extra := make(map[string]interface{})
			excludeFields := []string{"ts", "trace.id", "span.id", "level", "msg", "error", "err", "zalopay.id", "env", "service.id"}
			for key, val := range msgObj {
				if !slices.Contains(excludeFields, key) {
					if v, ok := val.(string); ok {
						extra[key] = truncate(v, 512)
					}
				}
			}
			entry.Extra = extra
		} else {
			entry.Message = truncate(msgStr, 512)
		}
	}

	// Fallback to top-level fields
	if entry.TraceID == "" {
		if v, ok := source["trace.id"].(string); ok {
			entry.TraceID = v
		}
	}
	if entry.Level == "" {
		if v, ok := source["level"].(string); ok {
			entry.Level = v
		}
	}

	return entry
}

func truncate(s string, maxLen int) string {
	if len(s) <= maxLen {
		return s
	}
	return s[:maxLen] + "..."
}

// buildTimeRange creates a time range filter for OpenSearch queries.
func buildTimeRange(eventTime string, hoursDelta int) (map[string]interface{}, error) {
	var baseTime time.Time
	var err error

	if eventTime == "" {
		baseTime = time.Now()
	} else {
		// Try common formats
		formats := []string{
			time.RFC3339,
			"2006-01-02T15:04:05",
			"2006-01-02 15:04:05",
			"2006-01-02",
		}
		for _, f := range formats {
			baseTime, err = time.Parse(f, eventTime)
			if err == nil {
				break
			}
		}
		if baseTime.IsZero() {
			return nil, fmt.Errorf("could not parse event_time: %s (supported: RFC3339, ISO datetime, date)", eventTime)
		}
	}

	delta := time.Duration(hoursDelta) * time.Hour
	from := baseTime.Add(-delta)
	to := baseTime.Add(delta)

	return map[string]interface{}{
		"gte":    from.Format(time.RFC3339),
		"lte":    to.Format(time.RFC3339),
		"format": "strict_date_optional_time",
	}, nil
}

// FormatLogEntries formats log entries as a readable string for LLM consumption.
func FormatLogEntries(entries []LogEntry) string {
	if len(entries) == 0 {
		return "No log entries found."
	}

	var sb strings.Builder
	sb.WriteString(fmt.Sprintf("Found %d log entries:\n\n", len(entries)))

	for i, e := range entries {
		sb.WriteString(fmt.Sprintf("--- Entry %d ---\n", i+1))
		if e.Timestamp != "" {
			sb.WriteString(fmt.Sprintf("Time: %s\n", e.Timestamp))
		}
		if e.Level != "" {
			sb.WriteString(fmt.Sprintf("Level: %s\n", e.Level))
		}
		if e.TraceID != "" {
			sb.WriteString(fmt.Sprintf("Trace ID: %s\n", e.TraceID))
		}
		if e.SpanID != "" {
			sb.WriteString(fmt.Sprintf("Span ID: %s\n", e.SpanID))
		}
		if e.Message != "" {
			sb.WriteString(fmt.Sprintf("Message: %s\n", e.Message))
		}
		if e.Error != "" {
			sb.WriteString(fmt.Sprintf("Error: %s\n", e.Error))
		}
		if e.ServiceName != "" {
			sb.WriteString(fmt.Sprintf("Service Name: %s\n", e.ServiceName))
		}
		if e.Extra != nil {
			extraJSON, _ := json.Marshal(e.Extra)
			sb.WriteString(fmt.Sprintf("Extra info: %s\n", string(extraJSON)))
		}
		sb.WriteString("\n")
	}

	return sb.String()
}
