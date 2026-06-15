// Package bootstrap provides seed data for new workspaces.
package bootstrap

import (
	"context"
	_ "embed"

	"gitlab.zalopay.vn/fin/lending/lending-claw/internal/store"
)

//go:embed files/AGENT.md
var agentMD string

//go:embed files/IDENTITY.md
var identityMD string

//go:embed files/SOUL.md
var soulMD string

// DefaultContextFiles returns the starter context files every new workspace is
// seeded with. They are global-scope (apply to all users of the workspace).
func DefaultContextFiles() []store.ContextFile {
	return []store.ContextFile{
		{Scope: "global", Path: "AGENT.md", Content: agentMD},
		{Scope: "global", Path: "IDENTITY.md", Content: identityMD},
		{Scope: "global", Path: "SOUL.md", Content: soulMD},
	}
}

// SeedContextFiles upserts the default context files into a workspace. Safe to
// call repeatedly (Upsert is idempotent by scope+path).
func SeedContextFiles(ctx context.Context, store store.ContextFileStore, workspaceID string) error {
	for _, f := range DefaultContextFiles() {
		file := f // copy; Upsert assigns an ID
		if err := store.Upsert(ctx, workspaceID, &file); err != nil {
			return err
		}
	}
	return nil
}
