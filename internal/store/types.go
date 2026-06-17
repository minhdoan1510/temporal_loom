package store

import (
	"context"
	"time"

	"gitlab.zalopay.vn/fin/lending/lending-claw/internal/providers"
)

// Workspace is a tenant boundary. Each workspace independently owns its
// sessions, skills, context files, knowledge, MCP servers, and roles.
type Workspace struct {
	ID          string    `json:"id"`
	Slug        string    `json:"slug"`
	Name        string    `json:"name"`
	Description string    `json:"description"`
	CreatedBy   *string   `json:"created_by,omitempty"`
	CreatedAt   time.Time `json:"created_at"`
	UpdatedAt   time.Time `json:"updated_at"`
}

// WorkspaceMember associates a user (JWT sub) with a workspace.
type WorkspaceMember struct {
	WorkspaceID string    `json:"workspace_id"`
	UserSub     string    `json:"user_sub"`
	AddedAt     time.Time `json:"added_at"`
}

// DefaultWorkspaceID is the id of the seeded default workspace (migration
// 000011). All pre-existing data is scoped to it, and non-HTTP channels
// (CLI/jira) default to it.
const DefaultWorkspaceID = "00000000-0000-0000-0000-000000000001"

// DefaultSessionTitle is shown before the first completed assistant response
// generates a conversation-specific title.
const DefaultSessionTitle = "Cuộc trò chuyện mới"

// SessionData holds conversation state for one session.
type SessionData struct {
	Key              string              `json:"key"`
	Title            string              `json:"title,omitempty"`
	CreatedBy        string              `json:"created_by,omitempty"`
	AgentID          string              `json:"agent_id,omitempty"`
	Messages         []providers.Message `json:"messages"`
	Summary          string              `json:"summary,omitempty"`
	Model            string              `json:"model,omitempty"`
	Provider         string              `json:"provider,omitempty"`
	Channel          string              `json:"channel,omitempty"`
	UserID           string              `json:"user_id,omitempty"`
	InputTokens      int64               `json:"input_tokens,omitempty"`
	OutputTokens     int64               `json:"output_tokens,omitempty"`
	CompactionCount  int                 `json:"compaction_count,omitempty"`
	LastPromptTokens int                 `json:"last_prompt_tokens,omitempty"`
	LastMessageCount int                 `json:"last_message_count,omitempty"`
	MemoryFlushAt    int                 `json:"memory_flush_at,omitempty"`
	ExtraMeta        map[string]string   `json:"extra_meta,omitempty"`
	Created          time.Time           `json:"created"`
	Updated          time.Time           `json:"updated"`
}

// SessionInfo is lightweight session metadata for listing.
type SessionInfo struct {
	Key          string    `json:"key"`
	Title        string    `json:"title,omitempty"`
	CreatedBy    string    `json:"created_by,omitempty"`
	AgentID      string    `json:"agent_id,omitempty"`
	MessageCount int       `json:"message_count"`
	CreatedAt    time.Time `json:"created_at"`
	UpdatedAt    time.Time `json:"updated_at"`
}

// ContextFile is a file injected into the system prompt.
type ContextFile struct {
	ID        string    `json:"id"`
	Scope     string    `json:"scope"`             // "global" or "user"
	UserID    *string   `json:"user_id,omitempty"` // NULL for global
	Path      string    `json:"path"`              // "SOUL.md", "IDENTITY.md"
	Content   string    `json:"content"`
	UpdatedAt time.Time `json:"updated_at"`
}

// Skill is a DB-backed skill definition that drives agent behavior. Content is
// the full SKILL.md (including YAML frontmatter); Name and Description are the
// Level-1 metadata parsed from that frontmatter.
type Skill struct {
	ID          string      `json:"id"`
	Name        string      `json:"name"`
	Description string      `json:"description"`
	Content     string      `json:"content"`
	Metadata    *string     `json:"metadata,omitempty"` // optional JSON
	Files       []SkillFile `json:"files,omitempty"`    // Level-3 reference files
	CreatedAt   time.Time   `json:"created_at"`
	UpdatedAt   time.Time   `json:"updated_at"`
}

// SkillFile is a reference document bundled with a skill (Level-3 resource).
// Path is the bundle-relative path (e.g. "references/policy.md").
type SkillFile struct {
	Path    string `json:"path"`
	Content string `json:"content"`
}

// MemoryDoc is a document stored in the memory system.
type MemoryDoc struct {
	ID        string    `json:"id"`
	Scope     string    `json:"scope"` // "global" or "user"
	UserID    *string   `json:"user_id,omitempty"`
	Path      string    `json:"path"`
	Content   string    `json:"content"`
	Metadata  *string   `json:"metadata,omitempty"` // optional JSON
	CreatedAt time.Time `json:"created_at"`
	UpdatedAt time.Time `json:"updated_at"`
}

// KnowledgeBase is a DB-backed knowledge base configuration.
type KnowledgeBase struct {
	ID           string     `json:"id"`
	Name         string     `json:"name"`
	Collection   string     `json:"collection"`
	Source       string     `json:"source"`
	SpaceKey     string     `json:"space_key"`
	RootPage     string     `json:"root_page"`
	Content      string     `json:"content,omitempty"` // markdown source: raw document text
	ChunkSize    int        `json:"chunk_size"`
	ChunkOverlap int        `json:"chunk_overlap"`
	Status       string     `json:"status"`
	ErrorMsg     *string    `json:"error_msg,omitempty"`
	TotalPages   int        `json:"total_pages"`
	TotalChunks  int        `json:"total_chunks"`
	TotalPoints  int        `json:"total_points"`
	LastSynced   *time.Time `json:"last_synced,omitempty"`
	CreatedBy    *string    `json:"created_by,omitempty"`
	CreatedAt    time.Time  `json:"created_at"`
	UpdatedAt    time.Time  `json:"updated_at"`
}

// Agent represents a workspace-scoped agent configuration.
type Agent struct {
	ID                string    `json:"id"`
	WorkspaceID       string    `json:"workspace_id"`
	Name              string    `json:"name"`
	Description       string    `json:"description"`
	SystemInstruction string    `json:"system_instruction"`
	Skills            []string  `json:"skills"`      // JSON array of skill names/IDs
	MemoryAccess      bool      `json:"memory_access"`
	MCPServers        []string  `json:"mcp_servers"`  // JSON array of MCP server names
	Tools             []string  `json:"tools"`        // JSON array of allowed platform/MCP tool names
	CreatedAt         time.Time `json:"created_at"`
	UpdatedAt         time.Time `json:"updated_at"`
}

// AgentStore manages Agent configs in the persistent store.
type AgentStore interface {
	List(ctx context.Context, workspaceID string) ([]Agent, error)
	Get(ctx context.Context, workspaceID, name string) (*Agent, error)
	GetByID(ctx context.Context, workspaceID, id string) (*Agent, error)
	Create(ctx context.Context, workspaceID string, agent *Agent) error
	Update(ctx context.Context, workspaceID string, agent *Agent) error
	Delete(ctx context.Context, workspaceID, id string) error
}
