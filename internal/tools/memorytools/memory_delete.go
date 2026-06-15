package memorytools

import (
	"context"
	"fmt"
	"log/slog"
	"strings"

	"gitlab.zalopay.vn/fin/lending/lending-claw/internal/memory"
	"gitlab.zalopay.vn/fin/lending/lending-claw/internal/store"
	"gitlab.zalopay.vn/fin/lending/lending-claw/internal/tools"
)

// MemoryDeleteTool implements the memory_delete tool for removing memory
// documents (and their vectors) that are wrong or obsolete.
type MemoryDeleteTool struct {
	manager  *memory.Manager
	memStore store.MemoryStore
}

// NewMemoryDeleteTool creates a memory_delete tool.
func NewMemoryDeleteTool(manager *memory.Manager, memStore store.MemoryStore) *MemoryDeleteTool {
	return &MemoryDeleteTool{manager: manager, memStore: memStore}
}

func (t *MemoryDeleteTool) Name() string { return "memory_delete" }

func (t *MemoryDeleteTool) Description() string {
	return "Delete a memory document by path, removing it from both storage and the vector index. " +
		"Use this to retract a fact that turned out to be WRONG or OBSOLETE when you cannot simply " +
		"correct it with memory_set overwrite (e.g. a date-based note holding an outdated entry). " +
		"Run memory_search first to find the exact path."
}

func (t *MemoryDeleteTool) Parameters() map[string]interface{} {
	return map[string]interface{}{
		"type": "object",
		"properties": map[string]interface{}{
			"path": map[string]interface{}{
				"type":        "string",
				"description": "Path of the memory document to delete (e.g. memory/2024-01-15.md, memory/preferences.md)",
			},
		},
		"required": []string{"path"},
	}
}

func (t *MemoryDeleteTool) Execute(ctx context.Context, args map[string]interface{}) *tools.Result {
	path, _ := args["path"].(string)
	if path == "" {
		return tools.ErrorResult("path parameter is required")
	}

	ws := tools.WorkspaceFromContext(ctx)
	if ws == "" {
		ws = store.DefaultWorkspaceID
	}

	doc, err := t.memStore.GetDocument(ctx, ws, "global", "", path)
	if err != nil {
		if strings.Contains(err.Error(), "not found") {
			return tools.NewResult(fmt.Sprintf("No memory document at %s — nothing to delete.", path))
		}
		return tools.ErrorResult(fmt.Sprintf("failed to read memory document: %v", err))
	}

	// Remove vectors first (non-fatal: keep going so storage stays consistent).
	if err := t.manager.DeleteDocumentVectors(ctx, ws, doc.ID); err != nil {
		slog.WarnContext(ctx, "memory_delete: failed to delete vectors", "path", path, "doc_id", doc.ID, "error", err)
	}

	if err := t.memStore.Delete(ctx, ws, doc.ID); err != nil {
		return tools.ErrorResult(fmt.Sprintf("failed to delete memory document: %v", err))
	}

	slog.WarnContext(ctx, "security.memory_delete", "path", path, "doc_id", doc.ID)
	return tools.NewResult(fmt.Sprintf("Deleted memory document %s.", path))
}
