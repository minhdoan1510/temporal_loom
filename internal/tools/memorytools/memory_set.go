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

// MemorySetTool implements the memory_set tool for writing/updating memory documents.
type MemorySetTool struct {
	manager  *memory.Manager
	memStore store.MemoryStore
}

// NewMemorySetTool creates a memory_set tool.
func NewMemorySetTool(manager *memory.Manager, memStore store.MemoryStore) *MemorySetTool {
	return &MemorySetTool{manager: manager, memStore: memStore}
}

func (t *MemorySetTool) Name() string { return "memory_set" }

func (t *MemorySetTool) Description() string {
	return "Write or update a memory document for durable recall in future sessions.\n" +
		"SAVE: confirmed facts, decisions and their rationale, user preferences, and corrections.\n" +
		"DO NOT save: guesses or unverified claims, transient turn-local state, or secrets/PII that are not needed.\n" +
		"Before writing, ALWAYS run memory_search first to (1) avoid duplicates and (2) detect a CONFLICTING entry. " +
		"If an existing entry contradicts the new fact, correct it: use overwrite (or memory_delete) instead of append, " +
		"so stale data does not linger.\n" +
		"Paths: for facts that change over time (preferences, project state, codenames) keep a single topic file " +
		"(e.g. memory/preferences.md, memory/project-falcon.md) and use overwrite. For immutable event logs, append to " +
		"memory/YYYY-MM-DD.md. Include a date in each entry.\n" +
		"Modes: append (default) adds to existing content; overwrite replaces it entirely."
}

func (t *MemorySetTool) Parameters() map[string]interface{} {
	return map[string]interface{}{
		"type": "object",
		"properties": map[string]interface{}{
			"path": map[string]interface{}{
				"type":        "string",
				"description": "Path of the memory document (e.g. memory/2024-01-15.md, memory/preferences.md)",
			},
			"content": map[string]interface{}{
				"type":        "string",
				"description": "Content to write. In append mode, this is appended to existing content.",
			},
			"mode": map[string]interface{}{
				"type":        "string",
				"enum":        []string{"append", "overwrite"},
				"description": "Write mode: 'append' (default) adds to existing content, 'overwrite' replaces it entirely.",
			},
		},
		"required": []string{"path", "content"},
	}
}

func (t *MemorySetTool) Execute(ctx context.Context, args map[string]interface{}) *tools.Result {
	path, _ := args["path"].(string)
	if path == "" {
		return tools.ErrorResult("path parameter is required")
	}

	content, _ := args["content"].(string)
	if content == "" {
		return tools.ErrorResult("content parameter is required")
	}

	mode := "append"
	if m, ok := args["mode"].(string); ok && m != "" {
		mode = m
	}

	ws := tools.WorkspaceFromContext(ctx)
	if ws == "" {
		ws = store.DefaultWorkspaceID
	}

	// For append mode, fetch existing content and concatenate
	if mode == "append" {
		existing, err := t.memStore.GetDocument(ctx, ws, "global", "", path)
		if err != nil {
			if !strings.Contains(err.Error(), "not found") {
				return tools.ErrorResult(fmt.Sprintf("failed to read existing document: %v", err))
			}
			// Document doesn't exist yet — treat as new
		} else {
			// Dedup: skip appending content that is already present (normalized
			// substring match) so the same fact is not stored repeatedly.
			if isDuplicateContent(existing.Content, content) {
				slog.InfoContext(ctx, "memory_set: skipped duplicate append", "path", path)
				return tools.NewResult(fmt.Sprintf("Memory already contains this content at %s — skipped duplicate append.", path))
			}
			content = existing.Content + "\n" + content
		}
	}

	// Upsert to MySQL
	doc := &store.MemoryDoc{
		Scope:   "global",
		Path:    path,
		Content: content,
	}
	if err := t.memStore.Upsert(ctx, ws, doc); err != nil {
		return tools.ErrorResult(fmt.Sprintf("failed to save memory document: %v", err))
	}

	// Re-fetch to get canonical ID (ON DUPLICATE KEY keeps original ID)
	saved, err := t.memStore.GetDocument(ctx, ws, "global", "", path)
	if err != nil {
		slog.WarnContext(ctx, "memory_set: saved but failed to re-fetch", "path", path, "error", err)
		return tools.NewResult(fmt.Sprintf("Memory saved to %s (vector indexing skipped)", path))
	}

	// Delete old vectors (non-fatal)
	if err := t.manager.DeleteDocumentVectors(ctx, ws, saved.ID); err != nil {
		slog.WarnContext(ctx, "memory_set: failed to delete old vectors", "path", path, "error", err)
	}

	// Index new vectors (non-fatal)
	if err := t.manager.IndexDocument(ctx, ws, saved); err != nil {
		slog.WarnContext(ctx, "memory_set: failed to index vectors", "path", path, "error", err)
	}

	slog.WarnContext(ctx, "security.memory_write", "path", path, "mode", mode, "content_len", len(content))
	return tools.NewResult(fmt.Sprintf("Memory saved to %s (%d chars, mode=%s)", path, len(content), mode))
}

// normalizeForDedup lowercases and collapses all whitespace runs to single
// spaces so trivially-different formatting compares equal.
func normalizeForDedup(s string) string {
	return strings.ToLower(strings.Join(strings.Fields(s), " "))
}

// isDuplicateContent reports whether newContent is already present in existing
// (after whitespace/case normalization). Empty new content is never duplicate.
func isDuplicateContent(existing, newContent string) bool {
	n := normalizeForDedup(newContent)
	if n == "" {
		return false
	}
	return strings.Contains(normalizeForDedup(existing), n)
}

func truncate(s string, maxLen int) string {
	if len(s) <= maxLen {
		return s
	}
	return s[:maxLen] + "..."
}
