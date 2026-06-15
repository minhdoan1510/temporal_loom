package store

// Stores is the platform store container.
type Stores struct {
	Workspaces   WorkspaceStore
	Sessions     SessionStore
	ContextFiles ContextFileStore
	Skills       SkillStore
	Memory       MemoryStore
	Knowledge    KnowledgeStore
	MCPServers   MCPServerStore
}
