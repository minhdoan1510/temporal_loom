package handler

import (
	"context"
	"net/http"

	skillscache "gitlab.zalopay.vn/fin/lending/lending-claw/internal/skills"
	"gitlab.zalopay.vn/fin/lending/lending-claw/internal/store"
	"gitlab.zalopay.vn/fin/lending/lending-claw/pkg/httputil"
)

// SkillsHandler handles /api/v1/skills endpoints.
type SkillsHandler struct {
	skills store.SkillStore
	cache  *skillscache.Cache // optional: refreshed after mutations so the agent sees changes immediately
}

// NewSkillsHandler creates a SkillsHandler. cache may be nil if no in-memory cache is in use.
func NewSkillsHandler(skillStore store.SkillStore, cache *skillscache.Cache) *SkillsHandler {
	return &SkillsHandler{skills: skillStore, cache: cache}
}

func (h *SkillsHandler) refreshCache(ctx context.Context, workspaceID string) {
	if h.cache != nil {
		h.cache.Refresh(ctx, workspaceID)
	}
}

// skillResponse wraps a skill with the list of reference files that were
// skipped (scripts/binaries) when saving.
type skillResponse struct {
	*store.Skill
	SkippedFiles []string `json:"skipped_files,omitempty"`
}

// applyFrontmatter parses and validates the SKILL.md frontmatter, populating the
// skill's Name/Description (Level-1 metadata). Returns a user-facing error message.
func applyFrontmatter(skill *store.Skill) (msg string, ok bool) {
	name, desc, _, found := skillscache.ParseFrontmatter(skill.Content)
	if !found {
		return "content must be a SKILL.md document starting with YAML frontmatter (---\\nname: ...\\ndescription: ...\\n---)", false
	}
	if err := skillscache.ValidateMetadata(name, desc); err != nil {
		return err.Error(), false
	}
	skill.Name = name
	skill.Description = desc
	return "", true
}

func skippedPaths(files []store.SkillFile) []string {
	if len(files) == 0 {
		return nil
	}
	paths := make([]string, len(files))
	for i, f := range files {
		paths[i] = f.Path
	}
	return paths
}

// List returns all skills in the active workspace.
func (h *SkillsHandler) List(w http.ResponseWriter, r *http.Request) {
	skills, err := h.skills.List(r.Context(), httputil.WorkspaceFromContext(r.Context()))
	if err != nil {
		httputil.WriteError(w, http.StatusInternalServerError, "failed to list skills: "+err.Error())
		return
	}
	httputil.WriteJSON(w, http.StatusOK, skills)
}

// Create inserts a new skill.
func (h *SkillsHandler) Create(w http.ResponseWriter, r *http.Request) {
	var skill store.Skill
	if err := httputil.ReadJSON(r, &skill); err != nil {
		httputil.WriteError(w, http.StatusBadRequest, "invalid JSON body")
		return
	}
	if skill.Content == "" {
		httputil.WriteError(w, http.StatusBadRequest, "content is required")
		return
	}
	if msg, ok := applyFrontmatter(&skill); !ok {
		httputil.WriteError(w, http.StatusBadRequest, msg)
		return
	}

	ws := httputil.WorkspaceFromContext(r.Context())
	keep, skipped := skillscache.SplitReferenceFiles(skill.Files)
	if err := h.skills.Create(r.Context(), ws, &skill); err != nil {
		httputil.WriteError(w, http.StatusInternalServerError, "failed to create skill: "+err.Error())
		return
	}
	if err := h.skills.ReplaceFiles(r.Context(), ws, skill.ID, keep); err != nil {
		httputil.WriteError(w, http.StatusInternalServerError, "failed to save reference files: "+err.Error())
		return
	}
	skill.Files = keep
	h.refreshCache(r.Context(), ws)
	httputil.WriteJSON(w, http.StatusCreated, skillResponse{Skill: &skill, SkippedFiles: skippedPaths(skipped)})
}

// Get returns a skill by ID.
func (h *SkillsHandler) Get(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	if id == "" {
		httputil.WriteError(w, http.StatusBadRequest, "skill id is required")
		return
	}

	ws := httputil.WorkspaceFromContext(r.Context())
	skill, err := h.skills.GetByID(r.Context(), ws, id)
	if err != nil {
		httputil.WriteError(w, http.StatusNotFound, err.Error())
		return
	}
	if files, err := h.skills.ListFiles(r.Context(), ws, id); err == nil {
		skill.Files = files
	}
	httputil.WriteJSON(w, http.StatusOK, skill)
}

// Update modifies a skill by ID.
func (h *SkillsHandler) Update(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	if id == "" {
		httputil.WriteError(w, http.StatusBadRequest, "skill id is required")
		return
	}

	var skill store.Skill
	if err := httputil.ReadJSON(r, &skill); err != nil {
		httputil.WriteError(w, http.StatusBadRequest, "invalid JSON body")
		return
	}
	skill.ID = id
	if skill.Content == "" {
		httputil.WriteError(w, http.StatusBadRequest, "content is required")
		return
	}
	if msg, ok := applyFrontmatter(&skill); !ok {
		httputil.WriteError(w, http.StatusBadRequest, msg)
		return
	}

	ws := httputil.WorkspaceFromContext(r.Context())
	keep, skipped := skillscache.SplitReferenceFiles(skill.Files)
	if err := h.skills.Update(r.Context(), ws, &skill); err != nil {
		httputil.WriteError(w, http.StatusInternalServerError, "failed to update skill: "+err.Error())
		return
	}
	if err := h.skills.ReplaceFiles(r.Context(), ws, skill.ID, keep); err != nil {
		httputil.WriteError(w, http.StatusInternalServerError, "failed to save reference files: "+err.Error())
		return
	}
	skill.Files = keep
	h.refreshCache(r.Context(), ws)
	httputil.WriteJSON(w, http.StatusOK, skillResponse{Skill: &skill, SkippedFiles: skippedPaths(skipped)})
}

// Delete removes a skill by ID.
func (h *SkillsHandler) Delete(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	if id == "" {
		httputil.WriteError(w, http.StatusBadRequest, "skill id is required")
		return
	}

	ws := httputil.WorkspaceFromContext(r.Context())
	if err := h.skills.Delete(r.Context(), ws, id); err != nil {
		httputil.WriteError(w, http.StatusInternalServerError, "failed to delete skill: "+err.Error())
		return
	}
	h.refreshCache(r.Context(), ws)
	httputil.WriteJSON(w, http.StatusOK, map[string]string{"status": "deleted"})
}
