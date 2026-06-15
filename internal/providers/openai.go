package providers

import (
	"bufio"
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"log/slog"
	"net/http"
	"net/url"
	"strings"
	"time"

	"gitlab.zalopay.vn/fin/lending/lending-claw/pkg/langfuse"
)

// OpenAIProvider implements Provider for OpenAI-compatible APIs
// (OpenAI, Groq, vLLM, LiteLLM, etc.)
type OpenAIProvider struct {
	name         string
	apiKey       string
	baseURL      string
	defaultModel string
	client       *http.Client
	retryConfig  RetryConfig
}

// Option configures an OpenAIProvider at construction time.
type Option func(*OpenAIProvider)

// WithProxy routes all outbound requests through the given HTTP proxy URL
// (e.g. http://10.40.81.10:8088). An empty or unparseable proxyURL is ignored
// (direct connection).
func WithProxy(proxyURL string) Option {
	return func(p *OpenAIProvider) {
		if proxyURL == "" {
			return
		}
		u, err := url.Parse(proxyURL)
		if err != nil {
			slog.Warn("openai provider: invalid proxy url, using direct connection", "proxy", proxyURL, "error", err)
			return
		}
		p.client.Transport = &http.Transport{Proxy: http.ProxyURL(u)}
	}
}

func NewOpenAIProvider(name, apiKey, baseURL, defaultModel string, opts ...Option) *OpenAIProvider {
	if baseURL == "" {
		baseURL = "https://api.openai.com/v1"
	}
	baseURL = strings.TrimRight(baseURL, "/")

	p := &OpenAIProvider{
		name:         name,
		apiKey:       apiKey,
		baseURL:      baseURL,
		defaultModel: defaultModel,
		client:       &http.Client{Timeout: 120 * time.Second},
		retryConfig:  DefaultRetryConfig(),
	}
	for _, opt := range opts {
		opt(p)
	}
	return p
}

func (p *OpenAIProvider) Name() string         { return p.name }
func (p *OpenAIProvider) DefaultModel() string { return p.defaultModel }

func (p *OpenAIProvider) resolveModel(model string) string {
	if model == "" {
		return p.defaultModel
	}
	return model
}

func (p *OpenAIProvider) Chat(ctx context.Context, req ChatRequest) (*ChatResponse, error) {
	model := p.resolveModel(req.Model)
	ctx, gen := langfuse.StartGeneration(ctx, p.genInfo(model, req))
	body := p.buildRequestBody(model, req, false)

	resp, err := RetryDo(ctx, p.retryConfig, func() (*ChatResponse, error) {
		respBody, err := p.doRequest(ctx, body)
		if err != nil {
			return nil, err
		}
		defer respBody.Close()

		var oaiResp openAIResponse
		if err := json.NewDecoder(respBody).Decode(&oaiResp); err != nil {
			return nil, fmt.Errorf("%s: decode response: %w", p.name, err)
		}

		return p.parseResponse(&oaiResp), nil
	})
	if err != nil {
		gen.Fail(err)
		return nil, err
	}
	in, out := usageTokens(resp.Usage)
	gen.End(resp, resp.FinishReason, in, out)
	return resp, nil
}

func (p *OpenAIProvider) ChatStream(ctx context.Context, req ChatRequest, onChunk func(StreamChunk)) (resp *ChatResponse, retErr error) {
	model := p.resolveModel(req.Model)
	ctx, gen := langfuse.StartGeneration(ctx, p.genInfo(model, req))
	defer func() {
		if retErr != nil || resp == nil {
			gen.Fail(retErr)
			return
		}
		in, out := usageTokens(resp.Usage)
		gen.End(resp, resp.FinishReason, in, out)
	}()

	body := p.buildRequestBody(model, req, true)

	// Retry only the connection phase; once streaming starts, no retry.
	respBody, err := RetryDo(ctx, p.retryConfig, func() (io.ReadCloser, error) {
		return p.doRequest(ctx, body)
	})
	if err != nil {
		return nil, err
	}
	defer respBody.Close()

	result := &ChatResponse{FinishReason: "stop"}
	accumulators := make(map[int]*toolCallAccumulator)

	scanner := bufio.NewScanner(respBody)
	for scanner.Scan() {
		line := scanner.Text()
		// SSE spec allows both "data: value" and "data:value" (space is optional).
		if !strings.HasPrefix(line, "data:") {
			continue
		}
		data := strings.TrimPrefix(line, "data:")
		data = strings.TrimPrefix(data, " ")
		if data == "[DONE]" {
			break
		}

		var chunk openAIStreamChunk
		if err := json.Unmarshal([]byte(data), &chunk); err != nil {
			continue
		}

		// Extract usage before checking choices — the final usage-only chunk
		// (stream_options.include_usage) often has empty choices.
		if chunk.Usage != nil {
			result.Usage = &Usage{
				PromptTokens:     chunk.Usage.PromptTokens,
				CompletionTokens: chunk.Usage.CompletionTokens,
				TotalTokens:      chunk.Usage.TotalTokens,
			}
			if chunk.Usage.PromptTokensDetails != nil {
				result.Usage.CacheReadTokens = chunk.Usage.PromptTokensDetails.CachedTokens
			}
		}

		if len(chunk.Choices) == 0 {
			continue
		}

		delta := chunk.Choices[0].Delta
		if delta.Content != "" {
			result.Content += delta.Content
			if onChunk != nil {
				onChunk(StreamChunk{Content: delta.Content})
			}
		}

		// Accumulate streamed tool calls
		for _, tc := range delta.ToolCalls {
			acc, ok := accumulators[tc.Index]
			if !ok {
				acc = &toolCallAccumulator{
					ToolCall: ToolCall{ID: tc.ID, Name: strings.TrimSpace(tc.Function.Name)},
				}
				accumulators[tc.Index] = acc
			}
			if tc.Function.Name != "" {
				acc.Name = strings.TrimSpace(tc.Function.Name)
			}
			acc.rawArgs += tc.Function.Arguments
		}

		if chunk.Choices[0].FinishReason != "" {
			result.FinishReason = chunk.Choices[0].FinishReason
		}
	}

	if err := scanner.Err(); err != nil {
		return nil, fmt.Errorf("%s: stream read error: %w", p.name, err)
	}

	// Parse accumulated tool call arguments
	for i := 0; i < len(accumulators); i++ {
		acc := accumulators[i]
		args := make(map[string]interface{})
		_ = json.Unmarshal([]byte(acc.rawArgs), &args)
		acc.Arguments = args
		result.ToolCalls = append(result.ToolCalls, acc.ToolCall)
	}

	if len(result.ToolCalls) > 0 {
		result.FinishReason = "tool_calls"
	}

	if onChunk != nil {
		onChunk(StreamChunk{Done: true})
	}

	return result, nil
}

// genInfo builds the Langfuse generation metadata for a chat request.
func (p *OpenAIProvider) genInfo(model string, req ChatRequest) langfuse.GenInfo {
	return langfuse.GenInfo{
		Provider:    p.name,
		Model:       model,
		Input:       req.Messages,
		Temperature: optFloat(req.Options.Temperature),
		TopP:        optFloat(req.Options.TopP),
		MaxTokens:   req.Options.MaxTokens,
	}
}

func usageTokens(u *Usage) (in, out int) {
	if u != nil {
		return u.PromptTokens, u.CompletionTokens
	}
	return 0, 0
}

func optFloat(f *float64) float64 {
	if f != nil {
		return *f
	}
	return 0
}

func (p *OpenAIProvider) buildRequestBody(model string, req ChatRequest, stream bool) map[string]interface{} {
	msgs := make([]map[string]interface{}, 0, len(req.Messages))
	for _, m := range req.Messages {
		msg := map[string]interface{}{
			"role": m.Role,
		}

		// Omit empty content for assistant messages with tool_calls (Gemini compat).
		if m.Content != "" || len(m.ToolCalls) == 0 {
			msg["content"] = m.Content
		}

		if len(m.ToolCalls) > 0 {
			toolCalls := make([]map[string]interface{}, len(m.ToolCalls))
			for i, tc := range m.ToolCalls {
				argsJSON, _ := json.Marshal(tc.Arguments)
				toolCalls[i] = map[string]interface{}{
					"id":   tc.ID,
					"type": "function",
					"function": map[string]interface{}{
						"name":      tc.Name,
						"arguments": string(argsJSON),
					},
				}
			}
			msg["tool_calls"] = toolCalls
		}

		if m.ToolCallID != "" {
			msg["tool_call_id"] = m.ToolCallID
		}

		msgs = append(msgs, msg)
	}

	body := map[string]interface{}{
		"model":    model,
		"messages": msgs,
		"stream":   stream,
	}

	if len(req.Tools) > 0 {
		body["tools"] = req.Tools
		body["tool_choice"] = "auto"
	}

	if stream {
		body["stream_options"] = map[string]interface{}{
			"include_usage": true,
		}
	}

	if req.Options.MaxTokens > 0 {
		body["max_tokens"] = req.Options.MaxTokens
	}
	if req.Options.Temperature != nil {
		body["temperature"] = *req.Options.Temperature
	}
	if req.Options.TopP != nil {
		body["top_p"] = *req.Options.TopP
	}

	return body
}

func (p *OpenAIProvider) doRequest(ctx context.Context, body interface{}) (io.ReadCloser, error) {
	data, err := json.Marshal(body)
	if err != nil {
		return nil, fmt.Errorf("%s: marshal request: %w", p.name, err)
	}

	httpReq, err := http.NewRequestWithContext(ctx, "POST", p.baseURL+"/chat/completions", bytes.NewReader(data))
	if err != nil {
		return nil, fmt.Errorf("%s: create request: %w", p.name, err)
	}

	httpReq.Header.Set("Content-Type", "application/json")
	httpReq.Header.Set("Authorization", "Bearer "+p.apiKey)

	resp, err := p.client.Do(httpReq)
	if err != nil {
		return nil, fmt.Errorf("%s: request failed: %w", p.name, err)
	}

	if resp.StatusCode != http.StatusOK {
		respBody, _ := io.ReadAll(resp.Body)
		resp.Body.Close()
		retryAfter := ParseRetryAfter(resp.Header.Get("Retry-After"))
		return nil, &HTTPError{
			Status:     resp.StatusCode,
			Body:       fmt.Sprintf("%s: %s", p.name, string(respBody)),
			RetryAfter: retryAfter,
		}
	}

	return resp.Body, nil
}

func (p *OpenAIProvider) parseResponse(resp *openAIResponse) *ChatResponse {
	result := &ChatResponse{FinishReason: "stop"}

	if len(resp.Choices) > 0 {
		msg := resp.Choices[0].Message
		result.Content = msg.Content
		result.FinishReason = resp.Choices[0].FinishReason

		for _, tc := range msg.ToolCalls {
			args := make(map[string]interface{})
			_ = json.Unmarshal([]byte(tc.Function.Arguments), &args)
			result.ToolCalls = append(result.ToolCalls, ToolCall{
				ID:        tc.ID,
				Name:      strings.TrimSpace(tc.Function.Name),
				Arguments: args,
			})
		}

		if len(result.ToolCalls) > 0 {
			result.FinishReason = "tool_calls"
		}
	}

	if resp.Usage != nil {
		result.Usage = &Usage{
			PromptTokens:     resp.Usage.PromptTokens,
			CompletionTokens: resp.Usage.CompletionTokens,
			TotalTokens:      resp.Usage.TotalTokens,
		}
		if resp.Usage.PromptTokensDetails != nil {
			result.Usage.CacheReadTokens = resp.Usage.PromptTokensDetails.CachedTokens
		}
	}

	return result
}

// OpenAI API response types (internal wire format)

type openAIResponse struct {
	Choices []openAIChoice `json:"choices"`
	Usage   *openAIUsage   `json:"usage,omitempty"`
}

type openAIChoice struct {
	Message      openAIMessage `json:"message"`
	FinishReason string        `json:"finish_reason"`
}

type openAIMessage struct {
	Role      string           `json:"role"`
	Content   string           `json:"content"`
	ToolCalls []openAIToolCall `json:"tool_calls,omitempty"`
}

type openAIToolCall struct {
	ID       string             `json:"id"`
	Type     string             `json:"type"`
	Function openAIFunctionCall `json:"function"`
}

type openAIFunctionCall struct {
	Name      string `json:"name"`
	Arguments string `json:"arguments"`
}

type openAIUsage struct {
	PromptTokens        int                  `json:"prompt_tokens"`
	CompletionTokens    int                  `json:"completion_tokens"`
	TotalTokens         int                  `json:"total_tokens"`
	PromptTokensDetails *openAIPromptDetails `json:"prompt_tokens_details,omitempty"`
}

type openAIPromptDetails struct {
	CachedTokens int `json:"cached_tokens"`
}

// Streaming types

type openAIStreamChunk struct {
	Choices []openAIStreamChoice `json:"choices"`
	Usage   *openAIUsage         `json:"usage,omitempty"`
}

type openAIStreamChoice struct {
	Delta        openAIStreamDelta `json:"delta"`
	FinishReason string            `json:"finish_reason,omitempty"`
}

type openAIStreamDelta struct {
	Content   string                 `json:"content,omitempty"`
	ToolCalls []openAIStreamToolCall `json:"tool_calls,omitempty"`
}

type openAIStreamToolCall struct {
	Index    int                `json:"index"`
	ID       string             `json:"id,omitempty"`
	Function openAIFunctionCall `json:"function"`
}

type toolCallAccumulator struct {
	ToolCall
	rawArgs string
}
