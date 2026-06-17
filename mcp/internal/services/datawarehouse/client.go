package datawarehouse

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strings"
	"time"

	"gitlab.zalopay.vn/fin/lending/lending-claw-mcp/internal/config"
)

// Client mocks a data warehouse by asking an OpenAI-compatible LLM to
// synthesize plausible result rows for a given SQL query. This lets the
// query_sql tool return realistic-looking data without a real warehouse.
type Client struct {
	baseURL    string
	apiKey     string
	model      string
	httpClient *http.Client
}

// NewClient builds a mock data-warehouse client. The LLM endpoint is taken
// from the shared `llm:` config; dwCfg.Model overrides the model if set.
func NewClient(llm config.LLMConfig, dwCfg config.DatawarehouseConfig) *Client {
	model := dwCfg.Model
	if model == "" {
		model = llm.Model
	}
	return &Client{
		baseURL:    strings.TrimRight(llm.BaseURL, "/"),
		apiKey:     llm.APIKey,
		model:      model,
		httpClient: &http.Client{Timeout: 120 * time.Second},
	}
}

const systemPrompt = `You are a data warehouse query engine for a consumer lending platform (Zalopay cash loan).
You will be given a SQL query. Execute it against a realistic-but-synthetic dataset and return ONLY the result set.

Rules:
- Return results as a clean Markdown table. The header row must be the selected columns (respecting aliases).
- Invent realistic, internally-consistent values: Vietnamese names, loan amounts in VND, ISO dates, plausible IDs, statuses like PENDING/APPROVED/REJECTED/DISBURSED/OVERDUE.
- Honor LIMIT clauses. If no LIMIT is present, return at most 10 rows.
- Respect WHERE/GROUP BY/ORDER BY/aggregate semantics as best you can.
- For aggregate queries (COUNT/SUM/AVG), return a single coherent summary row.
- Do NOT add commentary, explanations, or notes — output the table only.
- If the SQL is invalid, reply with a one-line error starting with "ERROR:".

Make the data feel REAL, not generated. Avoid uniform, evenly-spaced, or templated values:
- Amounts: use messy non-round numbers (e.g. 3.470.000, 12.850.000, 990.000), spread across a wide range with a few outliers (a tiny loan, a near-max loan). Never use a neat arithmetic progression.
- Dates/times: scatter irregularly — different days, weekdays vs weekends, varied hours/minutes (09:14, 23:41, 13:07), not on-the-hour or one-per-day.
- Categorical fields (status, channel, product, city): follow a realistic skewed distribution (most common value dominates, rare values appear occasionally) instead of cycling evenly through options.
- Names/IDs: vary length, regions, and formats; don't increment IDs by a constant step.
- Include occasional realistic imperfections where plausible: NULL/empty optional fields, a duplicate-ish name, rounding quirks.
- Counts/aggregates: avoid suspiciously round totals; let group sizes differ noticeably.`

// QuerySQL returns synthesized rows for the given SQL query as Markdown.
func (c *Client) QuerySQL(ctx context.Context, sql, schemaHint string) (string, error) {
	if c.baseURL == "" || c.apiKey == "" {
		return "", fmt.Errorf("llm endpoint not configured (set llm.base_url and llm.api_key)")
	}

	userContent := "SQL query:\n```sql\n" + sql + "\n```"
	if strings.TrimSpace(schemaHint) != "" {
		userContent += "\n\nSchema / context hints:\n" + schemaHint
	}

	payload := map[string]any{
		"model": c.model,
		"messages": []map[string]string{
			{"role": "system", "content": systemPrompt},
			{"role": "user", "content": userContent},
		},
		"temperature": 0.9,
	}
	body, err := json.Marshal(payload)
	if err != nil {
		return "", fmt.Errorf("marshal request: %w", err)
	}

	req, err := http.NewRequestWithContext(ctx, http.MethodPost, c.baseURL+"/chat/completions", bytes.NewReader(body))
	if err != nil {
		return "", err
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", "Bearer "+c.apiKey)

	resp, err := c.httpClient.Do(req)
	if err != nil {
		return "", fmt.Errorf("llm request: %w", err)
	}
	defer resp.Body.Close()

	respBody, _ := io.ReadAll(resp.Body)
	if resp.StatusCode != http.StatusOK {
		return "", fmt.Errorf("llm HTTP %d: %s", resp.StatusCode, string(respBody))
	}

	var out struct {
		Choices []struct {
			Message struct {
				Content string `json:"content"`
			} `json:"message"`
		} `json:"choices"`
	}
	if err := json.Unmarshal(respBody, &out); err != nil {
		return "", fmt.Errorf("decode llm response: %w", err)
	}
	if len(out.Choices) == 0 {
		return "", fmt.Errorf("llm returned no choices")
	}
	return strings.TrimSpace(out.Choices[0].Message.Content), nil
}
