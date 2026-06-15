package skillsearch

import (
	"context"
	"fmt"
	"log/slog"

	"gitlab.zalopay.vn/fin/lending/lending-claw/internal/skills"
	"gitlab.zalopay.vn/fin/lending/lending-claw/internal/store"
	"gitlab.zalopay.vn/fin/lending/lending-claw/internal/tools"
)

// ReadSkillFileTool implements read_skill_file (Level 3: reference resources).
// It returns the content of a single reference file bundled with a skill,
// loaded on demand so it only enters context when actually needed.
type ReadSkillFileTool struct {
	cache *skills.Cache
	store store.SkillStore
}

// NewReadSkillFileTool creates a read_skill_file tool.
func NewReadSkillFileTool(cache *skills.Cache, skillStore store.SkillStore) *ReadSkillFileTool {
	return &ReadSkillFileTool{cache: cache, store: skillStore}
}

func (t *ReadSkillFileTool) Name() string { return "read_skill_file" }

func (t *ReadSkillFileTool) Description() string {
	return "Read a reference file bundled with a skill. Use the file paths listed by read_skill (e.g. \"references/policy.md\") to load detailed material only when needed."
}

func (t *ReadSkillFileTool) Parameters() map[string]interface{} {
	return map[string]interface{}{
		"type": "object",
		"properties": map[string]interface{}{
			"skill": map[string]interface{}{
				"type":        "string",
				"description": "The name of the skill that owns the file",
			},
			"path": map[string]interface{}{
				"type":        "string",
				"description": "The bundle-relative file path, as listed by read_skill (e.g. references/policy.md)",
			},
		},
		"required": []string{"skill", "path"},
	}
}

func (t *ReadSkillFileTool) Execute(ctx context.Context, args map[string]interface{}) *tools.Result {
	name, _ := args["skill"].(string)
	path, _ := args["path"].(string)
	if name == "" || path == "" {
		return tools.ErrorResult("skill and path parameters are required")
	}

	ws := tools.WorkspaceFromContext(ctx)
	skill, found := t.cache.Get(ctx, ws, name)
	if !found {
		return tools.ErrorResult(fmt.Sprintf("Skill %q not found. Use skill_search to find available skills.", name))
	}

	file, err := t.store.GetFile(ctx, ws, skill.ID, path)
	if err != nil {
		return tools.ErrorResult(fmt.Sprintf("Reference file %q not found in skill %q. Call read_skill to see available files.", path, name))
	}

	slog.InfoContext(ctx, "read_skill_file executed", "skill", name, "path", path)
	return tools.NewResult(file.Content)
}
