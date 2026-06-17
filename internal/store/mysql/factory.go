package mysql

import (
	"database/sql"

	"gitlab.zalopay.vn/fin/lending/lending-claw/internal/store"
)

// NewStores creates all platform stores backed by MySQL.
// encryptionKey is used to encrypt secret columns (currently mcp_servers.auth_token)
// at rest; pass empty to disable encryption (legacy plaintext behavior).
func NewStores(db *sql.DB, encryptionKey string) *store.Stores {
	return &store.Stores{
		Workspaces:   NewMySQLWorkspaceStore(db),
		Sessions:     NewMySQLSessionStore(db),
		ContextFiles: NewMySQLContextFileStore(db),
		Skills:       NewMySQLSkillStore(db),
		Memory:       NewMySQLMemoryStore(db),
		Knowledge:    NewMySQLKnowledgeStore(db),
		MCPServers:   NewMySQLMCPServerStore(db, encryptionKey),
		Routines:     NewMySQLRoutineStore(db),
		RoutineRuns:  NewMySQLRoutineRunStore(db),
		Agents:       NewMySQLAgentStore(db),
	}
}
