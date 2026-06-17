package handler

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"

	"github.com/google/uuid"
	"gitlab.zalopay.vn/fin/lending/lending-claw/internal/agent"
	completionapi "gitlab.zalopay.vn/fin/lending/lending-claw/internal/completions"
	"gitlab.zalopay.vn/fin/lending/lending-claw/internal/providers"
	skillscache "gitlab.zalopay.vn/fin/lending/lending-claw/internal/skills"
	"gitlab.zalopay.vn/fin/lending/lending-claw/internal/store"
	"gitlab.zalopay.vn/fin/lending/lending-claw/pkg/httputil"
)

// SkillsHandler handles /api/v1/skills endpoints.
type SkillsHandler struct {
	skills store.SkillStore
	cache  *skillscache.Cache // optional: refreshed after mutations so the agent sees changes immediately
	loop   *agent.Loop
}

// NewSkillsHandler creates a SkillsHandler. cache may be nil if no in-memory cache is in use.
func NewSkillsHandler(skillStore store.SkillStore, cache *skillscache.Cache, loop *agent.Loop) *SkillsHandler {
	return &SkillsHandler{skills: skillStore, cache: cache, loop: loop}
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

// Generate streams or returns AI-generated skill packages based on a prompt.
func (h *SkillsHandler) Generate(w http.ResponseWriter, r *http.Request) {
	var body struct {
		Messages []providers.Message `json:"messages"`
	}
	if err := httputil.ReadJSON(r, &body); err != nil {
		httputil.WriteError(w, http.StatusBadRequest, "invalid JSON body")
		return
	}

	if len(body.Messages) == 0 {
		httputil.WriteError(w, http.StatusBadRequest, "messages is required")
		return
	}
	if h.loop == nil || h.loop.Provider() == nil {
		httputil.WriteError(w, http.StatusInternalServerError, "completion provider is not configured")
		return
	}

	flusher, ok := w.(http.Flusher)
	if !ok {
		httputil.WriteError(w, http.StatusInternalServerError, "streaming not supported")
		return
	}

	w.Header().Set("Content-Type", "text/event-stream")
	w.Header().Set("Cache-Control", "no-cache")
	w.Header().Set("Connection", "keep-alive")
	w.Header().Set("X-Accel-Buffering", "no")
	w.WriteHeader(http.StatusOK)

	systemPrompt := `You are a specialized agent builder. Your goal is to write a single "Skill" bundle for this platform based on the user's request.
A Skill consists of:
1. A main SKILL.md file. This file MUST start with YAML frontmatter containing:
---
name: [lowercase-alphanumeric-name-with-hyphens]
description: [concise description of when to use this skill]
---
Followed by the instructions markdown for the skill.

2. Zero or more reference files (e.g., config templates, checklists, markdown files) that the skill references.

You MUST wrap the SKILL.md content in a markdown code block labeled ` + "```" + `skill:
` + "```" + `skill
---
name: my-skill-name
description: A description.
---
# My Skill

## Instructions
...
` + "```" + `

If you need to define reference files, you MUST wrap each reference file's content in a markdown code block labeled ` + "```" + `reference:<path>` + "```" + ` where <path> is the relative file path. For example:
` + "```" + `reference:rules/git.json
{
  "format": "semantic"
}
` + "```" + `

Do not output code blocks inside the SKILL.md content that can confuse the parser. Make sure all instructions are clean.
Provide a brief introduction explaining what you generated, but keep the core focus on outputting the code blocks so the parser reads them correctly.`

	chatMessages := append([]providers.Message{
		{
			Role:    "system",
			Content: systemPrompt,
		},
	}, body.Messages...)

	chatReq := completionapi.ChatCompletionRequest{
		Messages: chatMessages,
		Model:    h.loop.Model(),
	}

	runID := uuid.New().String()
	agentID := "skills_creator"

	onChunk := func(chunk providers.StreamChunk) {
		if chunk.Content != "" {
			evt := agent.AgentEvent{
				Type:    agent.EventChunk,
				AgentID: agentID,
				RunID:   runID,
				Payload: map[string]string{"content": chunk.Content},
			}
			data, err := json.Marshal(evt)
			if err != nil {
				return
			}
			fmt.Fprintf(w, "event: %s\ndata: %s\n\n", agent.EventChunk, data)
			flusher.Flush()
		}
	}

	resp, err := completionapi.NewService(h.loop.Provider(), h.loop.Model()).Stream(r.Context(), chatReq, func(chunk completionapi.ChatCompletionChunk) {
		if len(chunk.Choices) == 0 {
			return
		}
		onChunk(providers.StreamChunk{Content: chunk.Choices[0].Delta.Content})
	})
	if err != nil {
		evt := agent.AgentEvent{
			Type:    agent.EventRunFailed,
			AgentID: agentID,
			RunID:   runID,
			Payload: map[string]string{"error": err.Error()},
		}
		data, _ := json.Marshal(evt)
		fmt.Fprintf(w, "event: %s\ndata: %s\n\n", agent.EventRunFailed, data)
		flusher.Flush()
		return
	}

	evt := agent.AgentEvent{
		Type:    agent.EventRunCompleted,
		AgentID: agentID,
		RunID:   runID,
		Payload: map[string]interface{}{
			"content": resp.Response.Content,
		},
	}
	data, _ := json.Marshal(evt)
	fmt.Fprintf(w, "event: %s\ndata: %s\n\n", agent.EventRunCompleted, data)
	flusher.Flush()
}
