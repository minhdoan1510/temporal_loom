package providers

import (
	"context"
	"encoding/json"
)

// Provider is the interface all LLM providers must implement.
type Provider interface {
	Chat(ctx context.Context, req ChatRequest) (*ChatResponse, error)
	ChatStream(ctx context.Context, req ChatRequest, onChunk func(StreamChunk)) (*ChatResponse, error)
	Name() string
	DefaultModel() string
}

// ChatRequest is the input to a provider Chat or ChatStream call.
type ChatRequest struct {
	Messages []Message
	Tools    []ToolDefinition
	Model    string
	Options  ChatOptions
}

// ChatOptions holds optional parameters for a chat request.
type ChatOptions struct {
	MaxTokens   int
	Temperature *float64
	TopP        *float64
}

// ChatResponse is the result of a provider Chat call.
type ChatResponse struct {
	Content      string     `json:"content"`
	ToolCalls    []ToolCall `json:"tool_calls,omitempty"`
	FinishReason string     `json:"finish_reason"` // "stop", "tool_calls", "length"
	Usage        *Usage     `json:"usage,omitempty"`
}

// Message represents a single message in a conversation.
type Message struct {
	Role       string     `json:"role"`                  // "system", "user", "assistant", "tool"
	Content    string     `json:"content"`
	ToolCalls  []ToolCall `json:"tool_calls,omitempty"`   // for assistant messages
	ToolCallID string     `json:"tool_call_id,omitempty"` // for tool result messages
}

// UnmarshalJSON handles both old (capitalized) and new (lowercase) JSON keys
// for backward compatibility with existing DB rows.
func (m *Message) UnmarshalJSON(data []byte) error {
	var raw map[string]json.RawMessage
	if err := json.Unmarshal(data, &raw); err != nil {
		return err
	}
	if v, ok := raw["role"]; ok {
		json.Unmarshal(v, &m.Role)
	} else if v, ok := raw["Role"]; ok {
		json.Unmarshal(v, &m.Role)
	}
	if v, ok := raw["content"]; ok {
		json.Unmarshal(v, &m.Content)
	} else if v, ok := raw["Content"]; ok {
		json.Unmarshal(v, &m.Content)
	}
	if v, ok := raw["tool_calls"]; ok {
		json.Unmarshal(v, &m.ToolCalls)
	} else if v, ok := raw["ToolCalls"]; ok {
		json.Unmarshal(v, &m.ToolCalls)
	}
	if v, ok := raw["tool_call_id"]; ok {
		json.Unmarshal(v, &m.ToolCallID)
	} else if v, ok := raw["ToolCallID"]; ok {
		json.Unmarshal(v, &m.ToolCallID)
	}
	return nil
}

// ToolCall represents a tool invocation requested by the LLM.
type ToolCall struct {
	ID        string                 `json:"id"`
	Name      string                 `json:"name"`
	Arguments map[string]interface{} `json:"arguments"`
}

// ToolDefinition describes a tool for the LLM API.
type ToolDefinition struct {
	Type     string             `json:"type"`
	Function ToolFunctionSchema `json:"function"`
}

// ToolFunctionSchema describes a tool's function signature.
type ToolFunctionSchema struct {
	Name        string                 `json:"name"`
	Description string                 `json:"description"`
	Parameters  map[string]interface{} `json:"parameters"`
}

// Usage tracks token consumption for a request.
type Usage struct {
	PromptTokens        int `json:"promptTokens"`
	CompletionTokens    int `json:"completionTokens"`
	TotalTokens         int `json:"totalTokens"`
	CacheCreationTokens int `json:"cacheCreationTokens,omitempty"`
	CacheReadTokens     int `json:"cacheReadTokens,omitempty"`
}

// StreamChunk is a single piece of streamed output.
type StreamChunk struct {
	Content string
	Done    bool
}
