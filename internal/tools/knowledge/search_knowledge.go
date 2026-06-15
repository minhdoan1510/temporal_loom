package knowledge

import (
	"context"
	"fmt"
	"sort"
	"strings"

	"gitlab.zalopay.vn/fin/lending/lending-claw/internal/services/qdrant"
	"gitlab.zalopay.vn/fin/lending/lending-claw/internal/store"
	"gitlab.zalopay.vn/fin/lending/lending-claw/internal/tools"
)

// SearchKnowledgeTool implements Tool for searching the knowledge base via
// Qdrant. Search is scoped to the active workspace: it queries only the
// collections of knowledge bases registered in that workspace.
type SearchKnowledgeTool struct {
	client    *qdrant.QdrantClient
	knowledge store.KnowledgeStore
}

// NewSearchKnowledgeTool creates a new search_knowledge tool. knowledgeStore
// may be nil, in which case the tool falls back to the client's default
// collection (legacy behavior).
func NewSearchKnowledgeTool(client *qdrant.QdrantClient, knowledgeStore store.KnowledgeStore) *SearchKnowledgeTool {
	return &SearchKnowledgeTool{client: client, knowledge: knowledgeStore}
}

func (t *SearchKnowledgeTool) Name() string { return "search_knowledge" }

func (t *SearchKnowledgeTool) Description() string {
	return "Search the knowledge base for relevant documents about processes, policies, " +
		"regulations, and operational guides. Use this tool to find answers about products, " +
		"customer support procedures, error codes, and business rules."
}

func (t *SearchKnowledgeTool) Parameters() map[string]interface{} {
	return map[string]interface{}{
		"type": "object",
		"properties": map[string]interface{}{
			"query": map[string]interface{}{
				"type":        "string",
				"description": "The search query describing what knowledge you are looking for",
			},
			"max_results": map[string]interface{}{
				"type":        "integer",
				"description": "Maximum number of results to return (default: 5, max: 10)",
			},
		},
		"required": []string{"query"},
	}
}

func (t *SearchKnowledgeTool) Execute(ctx context.Context, args map[string]interface{}) *tools.Result {
	query, _ := args["query"].(string)
	if query == "" {
		return tools.ErrorResult("query is required")
	}

	maxResults := 5
	if v, ok := args["max_results"].(float64); ok && v > 0 {
		maxResults = int(v)
		if maxResults > 10 {
			maxResults = 10
		}
	}

	results, err := t.search(ctx, query, maxResults)
	if err != nil {
		return tools.ErrorResult(fmt.Sprintf("Knowledge base search failed: %v", err))
	}

	if len(results) == 0 {
		return tools.NewResult("No relevant knowledge base documents found for the given query.")
	}

	var sb strings.Builder
	sb.WriteString(fmt.Sprintf("Found %d relevant knowledge base document(s):\n\n", len(results)))

	for i, r := range results {
		sb.WriteString(fmt.Sprintf("---\n### Result %d (relevance: %.2f)\n", i+1, r.Score))
		if r.Title != "" {
			sb.WriteString(fmt.Sprintf("**Title:** %s\n", r.Title))
		}
		if r.Category != "" {
			sb.WriteString(fmt.Sprintf("**Category:** %s\n", r.Category))
		}
		if r.Source != "" {
			sb.WriteString(fmt.Sprintf("**Source:** %s\n", r.Source))
		}
		if r.URL != "" {
			sb.WriteString(fmt.Sprintf("**URL:** %s\n", r.URL))
		}
		if r.DocLink != "" {
			sb.WriteString(fmt.Sprintf("**Document Link:** %s\n", r.DocLink))
		}
		if r.Content != "" {
			content := r.Content
			if len(content) > 2000 {
				content = content[:2000] + "... [truncated]"
			}
			sb.WriteString(fmt.Sprintf("\n%s\n\n", content))
		}
	}

	return tools.NewResult(sb.String())
}

// search queries the active workspace's knowledge base collections and returns
// the top results merged across them, ranked by score.
func (t *SearchKnowledgeTool) search(ctx context.Context, query string, maxResults int) ([]qdrant.KBSearchResult, error) {
	// Legacy fallback: no knowledge store wired → search the default collection.
	if t.knowledge == nil {
		return t.client.SearchKnowledge(ctx, query, maxResults)
	}

	ws := tools.WorkspaceFromContext(ctx)
	if ws == "" {
		ws = store.DefaultWorkspaceID
	}

	kbs, err := t.knowledge.List(ctx, ws)
	if err != nil {
		return nil, fmt.Errorf("list knowledge bases: %w", err)
	}

	// Deduplicate collections (multiple KBs may share one) and search each.
	seen := make(map[string]bool)
	var merged []qdrant.KBSearchResult
	for _, kb := range kbs {
		if kb.Collection == "" || seen[kb.Collection] {
			continue
		}
		seen[kb.Collection] = true
		res, err := t.client.SearchKnowledgeIn(ctx, kb.Collection, query, maxResults)
		if err != nil {
			// A missing/not-yet-indexed collection shouldn't fail the whole search.
			continue
		}
		merged = append(merged, res...)
	}

	sort.SliceStable(merged, func(i, j int) bool { return merged[i].Score > merged[j].Score })
	if len(merged) > maxResults {
		merged = merged[:maxResults]
	}
	return merged, nil
}
