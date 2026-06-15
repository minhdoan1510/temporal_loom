package skillsearch

import (
	"context"
	"encoding/json"
	"fmt"
	"log/slog"

	"gitlab.zalopay.vn/fin/lending/lending-claw/internal/skills"
	"gitlab.zalopay.vn/fin/lending/lending-claw/internal/store"
	"gitlab.zalopay.vn/fin/lending/lending-claw/internal/tools"
)

// ReadSkillTool implements the read_skill tool (Level 2: skill instructions).
type ReadSkillTool struct {
	cache *skills.Cache
	store store.SkillStore
}

// NewReadSkillTool creates a read_skill tool backed by the skills cache and store.
func NewReadSkillTool(cache *skills.Cache, skillStore store.SkillStore) *ReadSkillTool {
	return &ReadSkillTool{cache: cache, store: skillStore}
}

func (t *ReadSkillTool) Name() string { return "read_skill" }

func (t *ReadSkillTool) Description() string {
	return "Read the instructions of a skill by name. Use after skill_search. Returns the skill body plus a list of reference files; read any you need with read_skill_file."
}

func (t *ReadSkillTool) Parameters() map[string]interface{} {
	return map[string]interface{}{
		"type": "object",
		"properties": map[string]interface{}{
			"name": map[string]interface{}{
				"type":        "string",
				"description": "The name of the skill to read",
			},
		},
		"required": []string{"name"},
	}
}

func (t *ReadSkillTool) Execute(ctx context.Context, args map[string]interface{}) *tools.Result {
	name, _ := args["name"].(string)
	if name == "" {
		return tools.ErrorResult("name parameter is required")
	}

	ws := tools.WorkspaceFromContext(ctx)
	skill, found := t.cache.Get(ctx, ws, name)
	if !found {
		return tools.ErrorResult(fmt.Sprintf("Skill %q not found. Use skill_search to find available skills.", name))
	}

	// List reference files so the agent knows what it can read on demand (Level 3).
	var files []string
	if t.store != nil {
		if refs, err := t.store.ListFiles(ctx, ws, skill.ID); err == nil {
			for _, f := range refs {
				files = append(files, f.Path)
			}
		}
	}

	slog.InfoContext(ctx, "read_skill executed", "name", name, "files", len(files))

	data, _ := json.MarshalIndent(map[string]interface{}{
		"name":        skill.Name,
		"description": skill.Description,
		"content":     skills.StripFrontmatter(skill.Content),
		"files":       files,
	}, "", "  ")

	return tools.NewResult(string(data))
}
