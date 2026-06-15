package memorytools

import (
	"context"
	"encoding/json"
	"fmt"
	"log/slog"

	"gitlab.zalopay.vn/fin/lending/lending-claw/internal/memory"
	"gitlab.zalopay.vn/fin/lending/lending-claw/internal/store"
	"gitlab.zalopay.vn/fin/lending/lending-claw/internal/tools"
)

// MemoryGetTool implements the memory_get tool for reading memory documents.
type MemoryGetTool struct {
	manager  *memory.Manager
	memStore store.MemoryStore
}

// NewMemoryGetTool creates a memory_get tool.
func NewMemoryGetTool(manager *memory.Manager, memStore store.MemoryStore) *MemoryGetTool {
	return &MemoryGetTool{manager: manager, memStore: memStore}
}

func (t *MemoryGetTool) Name() string { return "memory_get" }

func (t *MemoryGetTool) Description() string {
	return "Read a specific memory document with optional line range. Use after memory_search to pull needed details."
}

func (t *MemoryGetTool) Parameters() map[string]interface{} {
	return map[string]interface{}{
		"type": "object",
		"properties": map[string]interface{}{
			"path": map[string]interface{}{
				"type":        "string",
				"description": "Path of the memory document to read",
			},
			"from": map[string]interface{}{
				"type":        "integer",
				"description": "Start line number (1-indexed). Omit to read from beginning.",
			},
			"lines": map[string]interface{}{
				"type":        "integer",
				"description": "Number of lines to read. Omit to read entire document.",
			},
		},
		"required": []string{"path"},
	}
}

func (t *MemoryGetTool) Execute(ctx context.Context, args map[string]interface{}) *tools.Result {
	path, _ := args["path"].(string)
	if path == "" {
		return tools.ErrorResult("path parameter is required")
	}

	var fromLine, numLines int
	if from, ok := args["from"].(float64); ok {
		fromLine = int(from)
	}
	if lines, ok := args["lines"].(float64); ok {
		numLines = int(lines)
	}

	ws := tools.WorkspaceFromContext(ctx)
	if ws == "" {
		ws = store.DefaultWorkspaceID
	}

	// Try global scope first
	text, err := t.manager.GetDocument(ctx, ws, "global", "", path, fromLine, numLines)
	if err != nil {
		return tools.ErrorResult(fmt.Sprintf("failed to read %s: %v", path, err))
	}

	if text == "" {
		return tools.NewResult(fmt.Sprintf("Document %s is empty or the specified range has no content.", path))
	}

	slog.InfoContext(ctx, "memory_get executed", "path", path, "from", fromLine, "lines", numLines)

	data, _ := json.MarshalIndent(map[string]interface{}{
		"path": path,
		"text": text,
	}, "", "  ")
	return tools.NewResult(string(data))
}
