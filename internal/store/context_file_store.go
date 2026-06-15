package store

import "context"

// ContextFileStore manages context files stored in MySQL. All methods are
// scoped to a workspace.
type ContextFileStore interface {
	// GetForUser returns merged context files: global files + per-user overrides.
	// Per-user files with the same path override global files.
	GetForUser(ctx context.Context, workspaceID, userID string) ([]ContextFile, error)

	// GetGlobal returns all global-scope context files in the workspace.
	GetGlobal(ctx context.Context, workspaceID string) ([]ContextFile, error)

	// Upsert creates or updates a context file in the workspace.
	Upsert(ctx context.Context, workspaceID string, file *ContextFile) error

	// Delete removes a context file by scope + userID + path in the workspace.
	Delete(ctx context.Context, workspaceID, scope string, userID *string, path string) error

	// List returns all context files in the workspace.
	List(ctx context.Context, workspaceID string) ([]ContextFile, error)
}
