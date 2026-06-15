package store

import "context"

// WorkspaceStore manages workspaces (tenants) and their membership.
type WorkspaceStore interface {
	// List returns all workspaces.
	List(ctx context.Context) ([]Workspace, error)

	// ListForUser returns the workspaces the given user (JWT sub) is a member of.
	ListForUser(ctx context.Context, userSub string) ([]Workspace, error)

	// Get returns a workspace by id or slug.
	Get(ctx context.Context, idOrSlug string) (*Workspace, error)

	// Create inserts a new workspace.
	Create(ctx context.Context, ws *Workspace) error

	// Update modifies an existing workspace's name/description.
	Update(ctx context.Context, ws *Workspace) error

	// Delete removes a workspace and its membership rows.
	Delete(ctx context.Context, id string) error

	// AddMember adds a user (JWT sub) to a workspace.
	AddMember(ctx context.Context, workspaceID, userSub string) error

	// RemoveMember removes a user from a workspace.
	RemoveMember(ctx context.Context, workspaceID, userSub string) error

	// ListMembers returns the members of a workspace.
	ListMembers(ctx context.Context, workspaceID string) ([]WorkspaceMember, error)

	// IsMember reports whether the user belongs to the workspace.
	IsMember(ctx context.Context, workspaceID, userSub string) (bool, error)
}
