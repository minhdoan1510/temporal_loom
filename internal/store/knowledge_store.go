package store

import "context"

// KnowledgeStore manages knowledge base configurations. All methods are scoped
// to a workspace.
type KnowledgeStore interface {
	// List returns all knowledge bases in the workspace.
	List(ctx context.Context, workspaceID string) ([]KnowledgeBase, error)

	// Get returns a knowledge base by ID in the workspace.
	Get(ctx context.Context, workspaceID, id string) (*KnowledgeBase, error)

	// Create inserts a new knowledge base in the workspace.
	Create(ctx context.Context, workspaceID string, kb *KnowledgeBase) error

	// Update modifies an existing knowledge base in the workspace.
	Update(ctx context.Context, workspaceID string, kb *KnowledgeBase) error

	// Delete removes a knowledge base by ID in the workspace.
	Delete(ctx context.Context, workspaceID, id string) error

	// UpdateSyncStatus updates sync-related fields after an indexing run.
	UpdateSyncStatus(ctx context.Context, workspaceID, id, status string, errorMsg *string, pages, chunks, points int) error
}
