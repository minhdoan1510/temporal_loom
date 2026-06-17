package completions

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"strings"
	"time"

	"github.com/google/uuid"
	"gitlab.zalopay.vn/fin/lending/lending-claw/internal/providers"
)

const MaxTokens = 16384

var ErrProviderNotConfigured = errors.New("completion provider is not configured")

type ValidationError struct {
	Message string
}

func (e ValidationError) Error() string {
	return e.Message
}

func IsValidationError(err error) bool {
	var validationErr ValidationError
	return errors.As(err, &validationErr)
}

type ChatCompletionRequest struct {
	Messages    []providers.Message `json:"messages"`
	Model       string              `json:"model,omitempty"`
	Stream      bool                `json:"stream,omitempty"`
	MaxTokens   int                 `json:"max_tokens,omitempty"`
	Temperature *float64            `json:"temperature,omitempty"`
	TopP        *float64            `json:"top_p,omitempty"`
	Tools       []json.RawMessage   `json:"tools,omitempty"`
	ToolChoice  json.RawMessage     `json:"tool_choice,omitempty"`
}

type Usage struct {
	PromptTokens     int `json:"prompt_tokens"`
	CompletionTokens int `json:"completion_tokens"`
	TotalTokens      int `json:"total_tokens"`
}

type Message struct {
	Role    string `json:"role,omitempty"`
	Content string `json:"content,omitempty"`
}

type CompletionChoice struct {
	Index        int     `json:"index"`
	Message      Message `json:"message"`
	FinishReason string  `json:"finish_reason"`
}

type ChatCompletionResponse struct {
	ID      string             `json:"id"`
	Object  string             `json:"object"`
	Created int64              `json:"created"`
	Model   string             `json:"model"`
	Choices []CompletionChoice `json:"choices"`
	Usage   *Usage             `json:"usage,omitempty"`
}

type CompletionChunkChoice struct {
	Index        int     `json:"index"`
	Delta        Message `json:"delta"`
	FinishReason *string `json:"finish_reason"`
}

type ChatCompletionChunk struct {
	ID      string                  `json:"id"`
	Object  string                  `json:"object"`
	Created int64                   `json:"created"`
	Model   string                  `json:"model"`
	Choices []CompletionChunkChoice `json:"choices"`
	Usage   *Usage                  `json:"usage,omitempty"`
}

type StreamResult struct {
	ID       string
	Created  int64
	Model    string
	Response *providers.ChatResponse
}

type Service struct {
	provider     providers.Provider
	defaultModel string
}

func NewService(provider providers.Provider, defaultModel string) *Service {
	return &Service{provider: provider, defaultModel: defaultModel}
}

func (s *Service) Validate(req ChatCompletionRequest) error {
	if s == nil || s.provider == nil {
		return ErrProviderNotConfigured
	}
	if len(req.Messages) == 0 {
		return ValidationError{Message: "messages is required"}
	}
	if len(req.Tools) > 0 || hasToolChoice(req.ToolChoice) {
		return ValidationError{Message: "tools are not supported on this endpoint"}
	}
	if req.MaxTokens < 0 || req.MaxTokens > MaxTokens {
		return ValidationError{Message: fmt.Sprintf("max_tokens must be between 0 and %d", MaxTokens)}
	}
	return nil
}

func (s *Service) Complete(ctx context.Context, req ChatCompletionRequest) (*ChatCompletionResponse, error) {
	providerReq, model, err := s.providerRequest(req)
	if err != nil {
		return nil, err
	}

	resp, err := s.provider.Chat(ctx, providerReq)
	if err != nil {
		return nil, err
	}

	return &ChatCompletionResponse{
		ID:      newCompletionID(),
		Object:  "chat.completion",
		Created: time.Now().Unix(),
		Model:   model,
		Choices: []CompletionChoice{{
			Index:        0,
			Message:      Message{Role: "assistant", Content: resp.Content},
			FinishReason: FinishReason(resp.FinishReason),
		}},
		Usage: UsageFrom(resp.Usage),
	}, nil
}

func (s *Service) Stream(ctx context.Context, req ChatCompletionRequest, onChunk func(ChatCompletionChunk)) (*StreamResult, error) {
	providerReq, model, err := s.providerRequest(req)
	if err != nil {
		return nil, err
	}

	id := newCompletionID()
	created := time.Now().Unix()
	resp, err := s.provider.ChatStream(ctx, providerReq, func(chunk providers.StreamChunk) {
		if chunk.Content == "" || onChunk == nil {
			return
		}
		onChunk(ChatCompletionChunk{
			ID:      id,
			Object:  "chat.completion.chunk",
			Created: created,
			Model:   model,
			Choices: []CompletionChunkChoice{{
				Index: 0,
				Delta: Message{Content: chunk.Content},
			}},
		})
	})
	if err != nil {
		return nil, err
	}
	return &StreamResult{
		ID:       id,
		Created:  created,
		Model:    model,
		Response: resp,
	}, nil
}

func (s *Service) providerRequest(req ChatCompletionRequest) (providers.ChatRequest, string, error) {
	if err := s.Validate(req); err != nil {
		return providers.ChatRequest{}, "", err
	}

	model := strings.TrimSpace(req.Model)
	if model == "" {
		model = strings.TrimSpace(s.defaultModel)
	}
	if model == "" {
		model = s.provider.DefaultModel()
	}

	return providers.ChatRequest{
		Messages: req.Messages,
		Model:    model,
		Options: providers.ChatOptions{
			MaxTokens:   req.MaxTokens,
			Temperature: req.Temperature,
			TopP:        req.TopP,
		},
	}, model, nil
}

func CompletionContent(resp *ChatCompletionResponse) string {
	if resp == nil || len(resp.Choices) == 0 {
		return ""
	}
	return resp.Choices[0].Message.Content
}

func FinishReason(reason string) string {
	if reason == "" {
		return "stop"
	}
	return reason
}

func UsageFrom(usage *providers.Usage) *Usage {
	if usage == nil {
		return nil
	}
	return &Usage{
		PromptTokens:     usage.PromptTokens,
		CompletionTokens: usage.CompletionTokens,
		TotalTokens:      usage.TotalTokens,
	}
}

func hasToolChoice(raw json.RawMessage) bool {
	trimmed := strings.TrimSpace(string(raw))
	return trimmed != "" && trimmed != "null"
}

func newCompletionID() string {
	return "chatcmpl-" + uuid.NewString()
}
