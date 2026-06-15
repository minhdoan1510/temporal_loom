package skillsearch

import (
	"context"
	"encoding/json"
	"fmt"
	"log/slog"

	"gitlab.zalopay.vn/fin/lending/lending-claw/internal/skills"
	"gitlab.zalopay.vn/fin/lending/lending-claw/internal/tools"
)

// SkillSearchTool implements the skill_search tool with BM25 search.
type SkillSearchTool struct {
	cache *skills.Cache
}

// NewSkillSearchTool creates a skill_search tool backed by the skills cache.
func NewSkillSearchTool(cache *skills.Cache) *SkillSearchTool {
	return &SkillSearchTool{cache: cache}
}

func (t *SkillSearchTool) Name() string { return "skill_search" }

func (t *SkillSearchTool) Description() string {
	return "Search for available skills by keyword. Returns matching skills with name, description, and relevance score. Use read_skill to read the full skill content."
}

func (t *SkillSearchTool) Parameters() map[string]interface{} {
	return map[string]interface{}{
		"type": "object",
		"properties": map[string]interface{}{
			"query": map[string]interface{}{
				"type":        "string",
				"description": "Search keywords to find relevant skills",
			},
			"max_results": map[string]interface{}{
				"type":        "integer",
				"description": "Maximum number of results to return (default: 5)",
			},
		},
		"required": []string{"query"},
	}
}

func (t *SkillSearchTool) Execute(ctx context.Context, args map[string]interface{}) *tools.Result {
	query, _ := args["query"].(string)
	if query == "" {
		return tools.ErrorResult("query parameter is required")
	}

	maxResults := 5
	if mr, ok := args["max_results"].(float64); ok && int(mr) > 0 {
		maxResults = int(mr)
	}

	results := t.cache.Search(ctx, tools.WorkspaceFromContext(ctx), query, maxResults)

	slog.InfoContext(ctx, "skill_search executed", "query", query, "results", len(results))

	if len(results) == 0 {
		return tools.NewResult(fmt.Sprintf("No skills found matching: %s", query))
	}

	data, _ := json.MarshalIndent(map[string]interface{}{
		"results": results,
		"count":   len(results),
	}, "", "  ")

	instruction := fmt.Sprintf(
		"\n\nACTION REQUIRED: Call read_skill with name %q to read the skill instructions, then follow them.",
		results[0].Name,
	)

	return tools.NewResult(string(data) + instruction)
}
