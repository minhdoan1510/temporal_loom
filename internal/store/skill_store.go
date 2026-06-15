package store

import "context"

// SkillStore manages skills stored in MySQL. All methods are scoped to a workspace.
type SkillStore interface {
	// List returns all skills in the workspace.
	List(ctx context.Context, workspaceID string) ([]Skill, error)

	// Get returns a skill by name in the workspace.
	Get(ctx context.Context, workspaceID, name string) (*Skill, error)

	// GetByID returns a skill by ID in the workspace.
	GetByID(ctx context.Context, workspaceID, id string) (*Skill, error)

	// Create inserts a new skill in the workspace.
	Create(ctx context.Context, workspaceID string, skill *Skill) error

	// Update modifies an existing skill in the workspace.
	Update(ctx context.Context, workspaceID string, skill *Skill) error

	// Delete removes a skill by ID in the workspace (and its reference files).
	Delete(ctx context.Context, workspaceID, id string) error

	// ListFiles returns the reference files of a skill.
	ListFiles(ctx context.Context, workspaceID, skillID string) ([]SkillFile, error)

	// GetFile returns a single reference file by its bundle-relative path.
	GetFile(ctx context.Context, workspaceID, skillID, path string) (*SkillFile, error)

	// ReplaceFiles atomically replaces the full set of reference files for a skill.
	ReplaceFiles(ctx context.Context, workspaceID, skillID string, files []SkillFile) error
}
