package agent

import "gitlab.zalopay.vn/fin/lending/lending-claw/internal/providers"

// AgentEvent is emitted during agent execution for broadcasting (SSE).
type AgentEvent struct {
	Type    string      `json:"type"` // "run.started", "run.completed", "run.failed", "chunk", "tool.call", "tool.result"
	AgentID string      `json:"agentId"`
	RunID   string      `json:"runId"`
	Payload interface{} `json:"payload,omitempty"`
}

// Event type constants.
const (
	EventRunStarted   = "run.started"
	EventRunCompleted = "run.completed"
	EventRunFailed    = "run.failed"
	EventChunk        = "chunk"
	EventToolCall     = "tool.call"
	EventToolResult   = "tool.result"
)

// RunRequest is the input for processing a message through the agent.
type RunRequest struct {
	WorkspaceID       string           // workspace (tenant) the run belongs to; defaults to the default workspace when empty
	SessionKey        string           // e.g. "ticket:LENDING-123", "user:456:cli"
	Message           string           // user message
	Channel           string           // source channel: "cli", "http", "jira", "telegram"
	ChatID            string           // source chat ID
	RunID             string           // unique run identifier
	UserID            string           // external user ID
	Stream            bool             // whether to stream response chunks
	ExtraSystemPrompt string           // optional: injected into system prompt
	HistoryLimit      int              // max user turns to keep in context (0=unlimited)
	OnEvent           func(AgentEvent) // optional per-request event callback
}

// RunResult is the output of a completed agent run.
type RunResult struct {
	Content    string           `json:"content"`
	RunID      string           `json:"runId"`
	Iterations int              `json:"iterations"`
	Usage      *providers.Usage `json:"usage,omitempty"`
}
