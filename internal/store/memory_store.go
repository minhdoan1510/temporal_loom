package store

import "context"

// MemoryStore manages memory documents stored in MySQL. All methods are scoped
// to a workspace.
type MemoryStore interface {
	// GetDocument returns a memory document by scope + userID + path in the workspace.
	GetDocument(ctx context.Context, workspaceID, scope, userID, path string) (*MemoryDoc, error)

	// GetByID returns a memory document by ID in the workspace.
	GetByID(ctx context.Context, workspaceID, id string) (*MemoryDoc, error)

	// ListDocuments returns memory documents matching scope/userID in the workspace.
	// Pass empty userID to list global docs only.
	ListDocuments(ctx context.Context, workspaceID, scope, userID string) ([]MemoryDoc, error)

	// Upsert creates or updates a memory document (matched by scope + user_id + path).
	Upsert(ctx context.Context, workspaceID string, doc *MemoryDoc) error

	// Delete removes a memory document by ID in the workspace.
	Delete(ctx context.Context, workspaceID, id string) error
}
