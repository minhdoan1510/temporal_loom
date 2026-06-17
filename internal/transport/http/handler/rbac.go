package handler

import (
	"errors"
	"net/http"
	"sort"
	"strings"

	"gitlab.zalopay.vn/fin/lending/lending-claw/internal/tools"
	"gitlab.zalopay.vn/fin/lending/lending-claw/pkg/httputil"
	"gitlab.zalopay.vn/fin/lending/lending-claw/pkg/rbac"
)

// RBACHandler handles RBAC management endpoints.
type RBACHandler struct {
	enforcer *rbac.Enforcer
	toolsReg *tools.Registry
}

// NewRBACHandler creates an RBACHandler.
func NewRBACHandler(enforcer *rbac.Enforcer, toolsReg *tools.Registry) *RBACHandler {
	return &RBACHandler{enforcer: enforcer, toolsReg: toolsReg}
}

// AllowedTool is the per-tool entry returned by /me. source is one of
// "platform" or "mcp:<server>" so the UI can group by origin.
type AllowedTool struct {
	Name          string `json:"name"`
	PermissionKey string `json:"permission_key"`
	Source        string `json:"source"`
}

// Me returns the current user's roles, permissions, and the tools they are
// allowed to call. Permissions==null means bootstrap mode (full access).
func (h *RBACHandler) Me(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	claims := httputil.ClaimsFromContext(ctx)
	perms := httputil.PermissionsFromContext(ctx)

	resp := map[string]any{
		"permissions": perms, // nil → JSON null = full access
	}
	if claims != nil {
		resp["user_id"] = claims.Sub
		if h.enforcer != nil {
			resp["roles"] = h.enforcer.GetRolesForUser(claims.Sub, httputil.WorkspaceFromContext(ctx))
		}
	}

	allowed := make([]AllowedTool, 0)
	permSet := make(map[string]bool, len(perms))
	for _, p := range perms {
		permSet[p] = true
	}
	bootstrap := perms == nil
	for _, t := range h.toolsReg.AllForWorkspace(httputil.WorkspaceFromContext(ctx)) {
		key := tools.PermissionKeyOf(t)
		if !bootstrap && !permSet[key] {
			continue
		}
		source := "platform"
		if strings.HasPrefix(key, "mcp:") {
			parts := strings.SplitN(key, ":", 3)
			if len(parts) >= 2 {
				source = "mcp:" + parts[1]
			}
		}
		allowed = append(allowed, AllowedTool{
			Name:          t.Name(),
			PermissionKey: key,
			Source:        source,
		})
	}
	sort.Slice(allowed, func(i, j int) bool {
		if allowed[i].Source != allowed[j].Source {
			return allowed[i].Source < allowed[j].Source
		}
		return allowed[i].Name < allowed[j].Name
	})
	resp["allowed_tools"] = allowed
	httputil.WriteJSON(w, http.StatusOK, resp)
}

// Resources returns all available resource names (tabs + tools + mcp funcs).
// Tools that originate from MCP servers appear with their full
// "mcp:<server>:<func>" key; platform tools appear as "tool:<name>".
func (h *RBACHandler) Resources(w http.ResponseWriter, r *http.Request) {
	resources := []string{
		"tab:sessions:read", "tab:sessions:create", "tab:sessions:delete",
		"tab:skills:read", "tab:skills:update", "tab:skills:delete",
		"tab:context-files:read", "tab:context-files:create", "tab:context-files:update", "tab:context-files:delete",
		"tab:knowledge:read", "tab:knowledge:create", "tab:knowledge:update", "tab:knowledge:delete",
		"tab:roles:read", "tab:roles:create", "tab:roles:update", "tab:roles:delete",
		"tab:mcp:read", "tab:mcp:create", "tab:mcp:update", "tab:mcp:delete",
		"tab:workspace:read", "tab:workspace:update",
		"tab:routines:read", "tab:routines:create", "tab:routines:update", "tab:routines:delete", "tab:routines:run",
	}
	for _, t := range h.toolsReg.AllForWorkspace(httputil.WorkspaceFromContext(r.Context())) {
		resources = append(resources, tools.PermissionKeyOf(t))
	}
	sort.Strings(resources)
	httputil.WriteJSON(w, http.StatusOK, resources)
}

// ListRoles returns all roles in the active workspace.
func (h *RBACHandler) ListRoles(w http.ResponseWriter, r *http.Request) {
	roles := h.enforcer.ListRoles(httputil.WorkspaceFromContext(r.Context()))
	httputil.WriteJSON(w, http.StatusOK, roles)
}

// CreateRole creates a new role.
func (h *RBACHandler) CreateRole(w http.ResponseWriter, r *http.Request) {
	var body struct {
		Name        string   `json:"name"`
		Permissions []string `json:"permissions"`
	}
	if err := httputil.ReadJSON(r, &body); err != nil {
		httputil.WriteError(w, http.StatusBadRequest, "invalid JSON body")
		return
	}
	if body.Name == "" {
		httputil.WriteError(w, http.StatusBadRequest, "name is required")
		return
	}
	if err := h.enforcer.CreateRole(httputil.WorkspaceFromContext(r.Context()), body.Name, body.Permissions); err != nil {
		httputil.WriteError(w, http.StatusConflict, err.Error())
		return
	}
	httputil.WriteJSON(w, http.StatusCreated, map[string]string{"name": body.Name})
}

// UpdateRole replaces a role's permissions.
func (h *RBACHandler) UpdateRole(w http.ResponseWriter, r *http.Request) {
	name := r.PathValue("name")
	var body struct {
		Permissions []string `json:"permissions"`
	}
	if err := httputil.ReadJSON(r, &body); err != nil {
		httputil.WriteError(w, http.StatusBadRequest, "invalid JSON body")
		return
	}
	if err := h.enforcer.UpdateRole(httputil.WorkspaceFromContext(r.Context()), name, body.Permissions); err != nil {
		httputil.WriteError(w, http.StatusInternalServerError, err.Error())
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

// DeleteRole deletes a role.
func (h *RBACHandler) DeleteRole(w http.ResponseWriter, r *http.Request) {
	name := r.PathValue("name")
	if err := h.enforcer.DeleteRole(httputil.WorkspaceFromContext(r.Context()), name); err != nil {
		if errors.Is(err, rbac.ErrLastAdmin) {
			httputil.WriteError(w, http.StatusConflict, err.Error())
			return
		}
		httputil.WriteError(w, http.StatusInternalServerError, err.Error())
		return
	}
	w.WriteHeader(http.StatusNoContent)
}
