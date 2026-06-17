package store

import "gitlab.zalopay.vn/fin/lending/lending-claw/internal/providers"

// SessionStore manages conversation sessions. All methods are scoped to a
// workspace; the (workspaceID, key) pair identifies a session.
type SessionStore interface {
	// GetOrCreate returns an existing session or creates a new one. kind is
	// "user" or "routine"; empty defaults to "user".
	GetOrCreate(workspaceID, key, createdBy, kind string) *SessionData
	// Get returns the session if it exists (cache or DB) WITHOUT creating one.
	// ok=false if the session does not exist yet.
	Get(workspaceID, key string) (*SessionData, bool)
	AddMessage(workspaceID, key string, msg providers.Message)
	SetMessages(workspaceID, key string, msgs []providers.Message)
	SetTitle(workspaceID, key, title string)
	GetHistory(workspaceID, key string) []providers.Message
	GetSummary(workspaceID, key string) string
	SetSummary(workspaceID, key, summary string)
	UpdateMetadata(workspaceID, key, model, provider, channel string)
	AccumulateTokens(workspaceID, key string, input, output int64)
	IncrementCompaction(workspaceID, key string)
	GetCompactionCount(workspaceID, key string) int
	TruncateHistory(workspaceID, key string, keepLast int)
	Reset(workspaceID, key string)
	Delete(workspaceID, key string) error
	List(workspaceID string, kind string) []SessionInfo
	Save(workspaceID, key string) error

	// Token calibration: store last known prompt tokens for better estimation
	SetLastPromptTokens(workspaceID, key string, tokens, msgCount int)
	GetLastPromptTokens(workspaceID, key string) (tokens, msgCount int)

	// Memory flush dedup: track which compaction cycle was last flushed
	GetMemoryFlushAt(workspaceID, key string) int
	SetMemoryFlushAt(workspaceID, key string, compactionCount int)

	// Free-form metadata stored alongside the session (serialized into the
	// metadata JSON column). Use for observability values like
	// "last_compaction_at" timestamps.
	SetSessionMetaValue(workspaceID, key, metaKey, value string)
	GetSessionMetaValue(workspaceID, key, metaKey string) string
}
