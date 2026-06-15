package handler

import (
	"errors"
	"log/slog"
	"net/http"
	"regexp"
	"strings"

	"github.com/google/uuid"
	"gitlab.zalopay.vn/fin/lending/lending-claw/internal/bootstrap"
	"gitlab.zalopay.vn/fin/lending/lending-claw/internal/store"
	"gitlab.zalopay.vn/fin/lending/lending-claw/internal/tools"
	"gitlab.zalopay.vn/fin/lending/lending-claw/pkg/httputil"
	"gitlab.zalopay.vn/fin/lending/lending-claw/pkg/rbac"
)

// WorkspacesHandler handles workspace management endpoints (CRUD + membership).
type WorkspacesHandler struct {
	store        store.WorkspaceStore
	contextFiles store.ContextFileStore
	enforcer     *rbac.Enforcer // may be nil when RBAC is disabled
	toolsReg     *tools.Registry
}

// NewWorkspacesHandler creates a WorkspacesHandler.
func NewWorkspacesHandler(s store.WorkspaceStore, contextFiles store.ContextFileStore, enforcer *rbac.Enforcer, toolsReg *tools.Registry) *WorkspacesHandler {
	return &WorkspacesHandler{store: s, contextFiles: contextFiles, enforcer: enforcer, toolsReg: toolsReg}
}

// tabResources is the full set of tab permissions granted to a new workspace's
// admin role so the creator retains full access once roles are defined.
var tabResources = []string{
	"tab:sessions:read", "tab:sessions:create", "tab:sessions:delete",
	"tab:skills:read", "tab:skills:create", "tab:skills:update", "tab:skills:delete",
	"tab:context-files:read", "tab:context-files:create", "tab:context-files:update", "tab:context-files:delete",
	"tab:knowledge:read", "tab:knowledge:create", "tab:knowledge:update", "tab:knowledge:delete",
	"tab:roles:read", "tab:roles:create", "tab:roles:update", "tab:roles:delete",
	"tab:mcp:read", "tab:mcp:create", "tab:mcp:update", "tab:mcp:delete",
	"tab:workspace:read", "tab:workspace:update",
}

var slugRe = regexp.MustCompile(`[^a-z0-9]+`)

func slugify(name string) string {
	s := slugRe.ReplaceAllString(strings.ToLower(name), "-")
	s = strings.Trim(s, "-")
	if s == "" {
		s = "workspace"
	}
	return s
}

// List returns the workspaces the caller is a member of.
func (h *WorkspacesHandler) List(w http.ResponseWriter, r *http.Request) {
	claims := httputil.ClaimsFromContext(r.Context())
	if claims == nil {
		httputil.WriteError(w, http.StatusUnauthorized, "unauthorized")
		return
	}
	wss, err := h.store.ListForUser(r.Context(), claims.Sub)
	if err != nil {
		httputil.WriteError(w, http.StatusInternalServerError, err.Error())
		return
	}
	// New users with no workspaces resolve to an empty list and are sent to the
	// first-workspace onboarding screen on the frontend; we no longer force-join
	// them into the default workspace. (Existing users hitting default-scoped
	// routes are still auto-enrolled by WorkspaceMiddleware for migration
	// continuity.)
	httputil.WriteJSON(w, http.StatusOK, wss)
}

// Get returns a workspace by id or slug.
func (h *WorkspacesHandler) Get(w http.ResponseWriter, r *http.Request) {
	ws, err := h.store.Get(r.Context(), r.PathValue("wsID"))
	if err != nil {
		httputil.WriteError(w, http.StatusNotFound, err.Error())
		return
	}
	httputil.WriteJSON(w, http.StatusOK, ws)
}

// Create creates a new workspace. The creator is added as a member and granted
// an "admin" role (with all tab + tool permissions) in the new workspace domain.
func (h *WorkspacesHandler) Create(w http.ResponseWriter, r *http.Request) {
	claims := httputil.ClaimsFromContext(r.Context())
	if claims == nil {
		httputil.WriteError(w, http.StatusUnauthorized, "unauthorized")
		return
	}
	var body struct {
		Name        string `json:"name"`
		Slug        string `json:"slug"`
		Description string `json:"description"`
	}
	if err := httputil.ReadJSON(r, &body); err != nil {
		httputil.WriteError(w, http.StatusBadRequest, "invalid JSON body")
		return
	}
	if strings.TrimSpace(body.Name) == "" {
		httputil.WriteError(w, http.StatusBadRequest, "name is required")
		return
	}

	slug := body.Slug
	if slug == "" {
		slug = slugify(body.Name)
	}
	// Ensure slug uniqueness with a short suffix on collision.
	if _, err := h.store.Get(r.Context(), slug); err == nil {
		slug = slug + "-" + uuid.New().String()[:8]
	}

	sub := claims.Sub
	ws := &store.Workspace{
		ID:          uuid.New().String(),
		Slug:        slug,
		Name:        body.Name,
		Description: body.Description,
		CreatedBy:   &sub,
	}
	if err := h.store.Create(r.Context(), ws); err != nil {
		httputil.WriteError(w, http.StatusInternalServerError, err.Error())
		return
	}
	if err := h.store.AddMember(r.Context(), ws.ID, sub); err != nil {
		httputil.WriteError(w, http.StatusInternalServerError, err.Error())
		return
	}

	// Seed an admin role in the new workspace domain and assign the creator.
	// Only grant tabs + platform tools + the workspace's OWN MCP tools (none
	// yet) — never another workspace's MCP tools.
	if h.enforcer != nil {
		perms := append([]string{}, tabResources...)
		if h.toolsReg != nil {
			for _, t := range h.toolsReg.AllForWorkspace(ws.ID) {
				perms = append(perms, tools.PermissionKeyOf(t))
			}
		}
		if err := h.enforcer.CreateRole(ws.ID, rbac.AdminRole, perms); err == nil {
			_ = h.enforcer.AddMember(ws.ID, rbac.AdminRole, sub)
		}
	}

	// Seed the workspace's default context files (AGENT.md / IDENTITY.md / SOUL.md).
	if h.contextFiles != nil {
		if err := bootstrap.SeedContextFiles(r.Context(), h.contextFiles, ws.ID); err != nil {
			slog.WarnContext(r.Context(), "failed to seed default context files",
				"workspace", ws.ID, "error", err)
		}
	}

	httputil.WriteJSON(w, http.StatusCreated, ws)
}

// Update modifies a workspace's name/description.
func (h *WorkspacesHandler) Update(w http.ResponseWriter, r *http.Request) {
	ws, err := h.store.Get(r.Context(), r.PathValue("wsID"))
	if err != nil {
		httputil.WriteError(w, http.StatusNotFound, err.Error())
		return
	}
	var body struct {
		Name        *string `json:"name"`
		Description *string `json:"description"`
	}
	if err := httputil.ReadJSON(r, &body); err != nil {
		httputil.WriteError(w, http.StatusBadRequest, "invalid JSON body")
		return
	}
	if body.Name != nil {
		ws.Name = *body.Name
	}
	if body.Description != nil {
		ws.Description = *body.Description
	}
	if err := h.store.Update(r.Context(), ws); err != nil {
		httputil.WriteError(w, http.StatusInternalServerError, err.Error())
		return
	}
	httputil.WriteJSON(w, http.StatusOK, ws)
}

// Delete removes a workspace.
func (h *WorkspacesHandler) Delete(w http.ResponseWriter, r *http.Request) {
	ws, err := h.store.Get(r.Context(), r.PathValue("wsID"))
	if err != nil {
		httputil.WriteError(w, http.StatusNotFound, err.Error())
		return
	}
	if ws.ID == store.DefaultWorkspaceID {
		httputil.WriteError(w, http.StatusBadRequest, "the default workspace cannot be deleted")
		return
	}
	if err := h.store.Delete(r.Context(), ws.ID); err != nil {
		httputil.WriteError(w, http.StatusInternalServerError, err.Error())
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

// ListMembers returns the members of a workspace.
func (h *WorkspacesHandler) ListMembers(w http.ResponseWriter, r *http.Request) {
	ws, err := h.store.Get(r.Context(), r.PathValue("wsID"))
	if err != nil {
		httputil.WriteError(w, http.StatusNotFound, err.Error())
		return
	}
	members, err := h.store.ListMembers(r.Context(), ws.ID)
	if err != nil {
		httputil.WriteError(w, http.StatusInternalServerError, err.Error())
		return
	}
	httputil.WriteJSON(w, http.StatusOK, members)
}

// AddMember adds a user to a workspace and, when roles are supplied, assigns
// them in the workspace domain so the new member has permissions immediately.
func (h *WorkspacesHandler) AddMember(w http.ResponseWriter, r *http.Request) {
	ws, err := h.store.Get(r.Context(), r.PathValue("wsID"))
	if err != nil {
		httputil.WriteError(w, http.StatusNotFound, err.Error())
		return
	}
	var body struct {
		Sub   string   `json:"sub"`
		Roles []string `json:"roles"`
	}
	if err := httputil.ReadJSON(r, &body); err != nil {
		httputil.WriteError(w, http.StatusBadRequest, "invalid JSON body")
		return
	}
	if body.Sub == "" {
		httputil.WriteError(w, http.StatusBadRequest, "sub is required")
		return
	}
	if err := h.store.AddMember(r.Context(), ws.ID, body.Sub); err != nil {
		httputil.WriteError(w, http.StatusInternalServerError, err.Error())
		return
	}
	if h.enforcer != nil {
		for _, role := range body.Roles {
			if err := h.enforcer.AddMember(ws.ID, role, body.Sub); err != nil {
				httputil.WriteError(w, http.StatusInternalServerError, err.Error())
				return
			}
		}
	}
	w.WriteHeader(http.StatusNoContent)
}

// SetMemberRoles replaces the set of roles assigned to a member in the
// workspace domain. Removing the last admin is rejected with 409.
func (h *WorkspacesHandler) SetMemberRoles(w http.ResponseWriter, r *http.Request) {
	ws, err := h.store.Get(r.Context(), r.PathValue("wsID"))
	if err != nil {
		httputil.WriteError(w, http.StatusNotFound, err.Error())
		return
	}
	sub := r.PathValue("sub")
	var body struct {
		Roles []string `json:"roles"`
	}
	if err := httputil.ReadJSON(r, &body); err != nil {
		httputil.WriteError(w, http.StatusBadRequest, "invalid JSON body")
		return
	}
	if h.enforcer == nil {
		w.WriteHeader(http.StatusNoContent)
		return
	}

	desired := make(map[string]bool, len(body.Roles))
	for _, role := range body.Roles {
		desired[role] = true
	}
	current := h.enforcer.GetRolesForUser(sub, ws.ID)
	currentSet := make(map[string]bool, len(current))
	for _, role := range current {
		currentSet[role] = true
	}

	// Remove roles no longer desired (reject removing the last admin).
	for _, role := range current {
		if desired[role] {
			continue
		}
		if err := h.enforcer.RemoveMember(ws.ID, role, sub); err != nil {
			if errors.Is(err, rbac.ErrLastAdmin) {
				httputil.WriteError(w, http.StatusConflict, err.Error())
				return
			}
			httputil.WriteError(w, http.StatusInternalServerError, err.Error())
			return
		}
	}
	// Add newly desired roles.
	for _, role := range body.Roles {
		if currentSet[role] {
			continue
		}
		if err := h.enforcer.AddMember(ws.ID, role, sub); err != nil {
			httputil.WriteError(w, http.StatusInternalServerError, err.Error())
			return
		}
	}
	w.WriteHeader(http.StatusNoContent)
}

// RemoveMember removes a user from a workspace, stripping all of their role
// assignments in the workspace domain first. Removing the last admin is
// rejected with 409 so a workspace always keeps a manager.
func (h *WorkspacesHandler) RemoveMember(w http.ResponseWriter, r *http.Request) {
	ws, err := h.store.Get(r.Context(), r.PathValue("wsID"))
	if err != nil {
		httputil.WriteError(w, http.StatusNotFound, err.Error())
		return
	}
	sub := r.PathValue("sub")
	if h.enforcer != nil {
		for _, role := range h.enforcer.GetRolesForUser(sub, ws.ID) {
			if err := h.enforcer.RemoveMember(ws.ID, role, sub); err != nil {
				if errors.Is(err, rbac.ErrLastAdmin) {
					httputil.WriteError(w, http.StatusConflict, err.Error())
					return
				}
				httputil.WriteError(w, http.StatusInternalServerError, err.Error())
				return
			}
		}
	}
	if err := h.store.RemoveMember(r.Context(), ws.ID, sub); err != nil {
		httputil.WriteError(w, http.StatusInternalServerError, err.Error())
		return
	}
	w.WriteHeader(http.StatusNoContent)
}
