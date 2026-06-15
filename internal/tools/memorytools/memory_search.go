package memorytools

import (
	"context"
	"encoding/json"
	"fmt"
	"log/slog"
	"strings"

	"gitlab.zalopay.vn/fin/lending/lending-claw/internal/memory"
	"gitlab.zalopay.vn/fin/lending/lending-claw/internal/store"
	"gitlab.zalopay.vn/fin/lending/lending-claw/internal/tools"
)

// MemorySearchTool implements the memory_search tool for vector search via Qdrant.
type MemorySearchTool struct {
	manager  *memory.Manager
	memStore store.MemoryStore
}

// NewMemorySearchTool creates a memory_search tool.
func NewMemorySearchTool(manager *memory.Manager, memStore store.MemoryStore) *MemorySearchTool {
	return &MemorySearchTool{manager: manager, memStore: memStore}
}

func (t *MemorySearchTool) Name() string { return "memory_search" }

func (t *MemorySearchTool) Description() string {
	return "Search memory documents for prior work, decisions, preferences, or domain knowledge. Returns top snippets with path + line numbers. Use memory_get to read full documents."
}

func (t *MemorySearchTool) Parameters() map[string]interface{} {
	return map[string]interface{}{
		"type": "object",
		"properties": map[string]interface{}{
			"query": map[string]interface{}{
				"type":        "string",
				"description": "Search query. Use the same language as stored content for best results.",
			},
			"max_results": map[string]interface{}{
				"type":        "integer",
				"description": "Maximum number of results to return (default: 6)",
			},
		},
		"required": []string{"query"},
	}
}

func (t *MemorySearchTool) Execute(ctx context.Context, args map[string]interface{}) *tools.Result {
	query, _ := args["query"].(string)
	if query == "" {
		return tools.ErrorResult("query parameter is required")
	}

	maxResults := 6
	if mr, ok := args["max_results"].(float64); ok && int(mr) > 0 {
		maxResults = int(mr)
	}

	ws := tools.WorkspaceFromContext(ctx)
	if ws == "" {
		ws = store.DefaultWorkspaceID
	}

	results, err := t.manager.Search(ctx, ws, query, maxResults)
	if err != nil {
		slog.WarnContext(ctx, "memory_search failed, falling back to store listing", "error", err)
		// Fallback: list documents from MySQL store
		return t.fallbackSearch(ctx, query)
	}

	if len(results) == 0 {
		return tools.NewResult("No memory results found for query: " + query)
	}

	slog.InfoContext(ctx, "memory_search executed", "query", query, "results", len(results))

	data, _ := json.MarshalIndent(map[string]interface{}{
		"results": results,
		"count":   len(results),
	}, "", "  ")
	return tools.NewResult(string(data))
}

// fallbackSearch lists memory documents from MySQL when Qdrant is unavailable.
func (t *MemorySearchTool) fallbackSearch(ctx context.Context, query string) *tools.Result {
	ws := tools.WorkspaceFromContext(ctx)
	if ws == "" {
		ws = store.DefaultWorkspaceID
	}
	docs, err := t.memStore.ListDocuments(ctx, ws, "global", "")
	if err != nil {
		return tools.ErrorResult(fmt.Sprintf("memory search failed: %v", err))
	}

	if len(docs) == 0 {
		return tools.NewResult("No memory documents found.")
	}

	// Simple keyword matching fallback
	queryLower := strings.ToLower(query)
	var matches []map[string]interface{}
	for _, doc := range docs {
		if strings.Contains(strings.ToLower(doc.Content), queryLower) ||
			strings.Contains(strings.ToLower(doc.Path), queryLower) {
			matches = append(matches, map[string]interface{}{
				"path":        doc.Path,
				"description": truncate(doc.Content, 200),
			})
		}
	}

	if len(matches) == 0 {
		// Return document list for context
		var paths []string
		for _, doc := range docs {
			paths = append(paths, doc.Path)
		}
		return tools.NewResult(fmt.Sprintf("No matching memory docs for %q. Available docs: %s. Use memory_get to read specific files.", query, strings.Join(paths, ", ")))
	}

	data, _ := json.MarshalIndent(map[string]interface{}{
		"results":  matches,
		"count":    len(matches),
		"fallback": true,
	}, "", "  ")
	return tools.NewResult(string(data))
}
