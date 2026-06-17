package handler

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"gitlab.zalopay.vn/fin/lending/lending-claw/internal/agent"
	"gitlab.zalopay.vn/fin/lending/lending-claw/internal/providers"
)

type completionTestProvider struct {
	req providers.ChatRequest
}

func (p *completionTestProvider) Chat(ctx context.Context, req providers.ChatRequest) (*providers.ChatResponse, error) {
	p.req = req
	return &providers.ChatResponse{
		Content:      "Tóm tắt tiêu đề",
		FinishReason: "stop",
		Usage: &providers.Usage{
			PromptTokens:     7,
			CompletionTokens: 4,
			TotalTokens:      11,
		},
	}, nil
}

func (p *completionTestProvider) ChatStream(ctx context.Context, req providers.ChatRequest, onChunk func(providers.StreamChunk)) (*providers.ChatResponse, error) {
	p.req = req
	onChunk(providers.StreamChunk{Content: "Xin"})
	onChunk(providers.StreamChunk{Content: " chào"})
	return &providers.ChatResponse{Content: "Xin chào", FinishReason: "stop"}, nil
}

func (p *completionTestProvider) Name() string {
	return "test"
}

func (p *completionTestProvider) DefaultModel() string {
	return "test-model"
}

func TestChatCompletionsReturnsOpenAIShape(t *testing.T) {
	provider := &completionTestProvider{}
	loop := agent.NewLoop(agent.LoopConfig{Provider: provider, Model: "default-model"})
	handler := NewCompletionsHandler(loop)

	req := httptest.NewRequest(http.MethodPost, "/chat/completions", strings.NewReader(`{
		"model": "title-model",
		"messages": [{"role": "user", "content": "Xin chào"}],
		"max_tokens": 32,
		"temperature": 0.2
	}`))
	rec := httptest.NewRecorder()

	handler.ChatCompletions(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, body = %s", rec.Code, rec.Body.String())
	}

	var body struct {
		Object  string `json:"object"`
		Model   string `json:"model"`
		Choices []struct {
			Message struct {
				Role    string `json:"role"`
				Content string `json:"content"`
			} `json:"message"`
			FinishReason string `json:"finish_reason"`
		} `json:"choices"`
		Usage struct {
			PromptTokens     int `json:"prompt_tokens"`
			CompletionTokens int `json:"completion_tokens"`
			TotalTokens      int `json:"total_tokens"`
		} `json:"usage"`
	}
	if err := json.NewDecoder(rec.Body).Decode(&body); err != nil {
		t.Fatalf("decode response: %v", err)
	}
	if body.Object != "chat.completion" {
		t.Fatalf("object = %q, want chat.completion", body.Object)
	}
	if body.Model != "title-model" {
		t.Fatalf("model = %q, want title-model", body.Model)
	}
	if len(body.Choices) != 1 || body.Choices[0].Message.Role != "assistant" || body.Choices[0].Message.Content != "Tóm tắt tiêu đề" {
		t.Fatalf("unexpected choices: %+v", body.Choices)
	}
	if provider.req.Model != "title-model" || len(provider.req.Tools) != 0 || provider.req.Options.MaxTokens != 32 {
		t.Fatalf("unexpected provider request: %+v", provider.req)
	}
	if body.Usage.TotalTokens != 11 {
		t.Fatalf("total tokens = %d, want 11", body.Usage.TotalTokens)
	}
}

func TestChatCompletionsRejectsTools(t *testing.T) {
	provider := &completionTestProvider{}
	loop := agent.NewLoop(agent.LoopConfig{Provider: provider, Model: "default-model"})
	handler := NewCompletionsHandler(loop)

	req := httptest.NewRequest(http.MethodPost, "/chat/completions", strings.NewReader(`{
		"messages": [{"role": "user", "content": "Xin chào"}],
		"tools": [{"type": "function"}]
	}`))
	rec := httptest.NewRecorder()

	handler.ChatCompletions(rec, req)

	if rec.Code != http.StatusBadRequest {
		t.Fatalf("status = %d, want %d", rec.Code, http.StatusBadRequest)
	}
}
