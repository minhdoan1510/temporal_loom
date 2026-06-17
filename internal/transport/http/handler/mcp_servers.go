package handler

import (
	"context"
	"fmt"
	"log/slog"
	"net/http"
	"net/url"
	"strings"
	"time"

	mcpmgr "gitlab.zalopay.vn/fin/lending/lending-claw/internal/mcp"
	"gitlab.zalopay.vn/fin/lending/lending-claw/internal/store"
	"gitlab.zalopay.vn/fin/lending/lending-claw/pkg/httputil"
	"gitlab.zalopay.vn/fin/lending/lending-claw/pkg/rbac"
)

// MCPServersHandler manages CRUD over external MCP server registrations and
// triggers re-discovery via the MCP Manager.
type MCPServersHandler struct {
	store    store.MCPServerStore
	manager  *mcpmgr.Manager
	enforcer *rbac.Enforcer // optional; used to clean up mcp:<server>:* perms on delete
}

func NewMCPServersHandler(s store.MCPServerStore, m *mcpmgr.Manager, e *rbac.Enforcer) *MCPServersHandler {
	return &MCPServersHandler{store: s, manager: m, enforcer: e}
}

// validateMCPURL ensures the URL is well-formed and uses an HTTP(S) scheme.
// The underlying MCP transport (modelcontextprotocol/go-sdk's
// StreamableClientTransport) is HTTP-only — gRPC-style targets like
// "dns:///host:port/path" parse but fail at request time with
// "unsupported protocol scheme".
func validateMCPURL(raw string) error {
	u, err := url.Parse(raw)
	if err != nil {
		return fmt.Errorf("invalid url: %w", err)
	}
	scheme := strings.ToLower(u.Scheme)
	if scheme != "http" && scheme != "https" {
		return fmt.Errorf("url must use http or https scheme (got %q)", u.Scheme)
	}
	if u.Host == "" {
		return fmt.Errorf("url must include a host")
	}
	return nil
}

type mcpServerResp struct {
	Name        string              `json:"name"`
	URL         string              `json:"url"`
	Enabled     bool                `json:"enabled"`
	Description string              `json:"description"`
	HasAuth     bool                `json:"has_auth"`
	LastSynced  *time.Time          `json:"last_synced,omitempty"`
	CreatedAt   time.Time           `json:"created_at"`
	UpdatedAt   time.Time           `json:"updated_at"`
	Functions   []store.MCPFunction `json:"functions"`
	Warning     string              `json:"warning,omitempty"`
}

func toResp(s store.MCPServer, funcs []store.MCPFunction, warning string) mcpServerResp {
	if funcs == nil {
		funcs = []store.MCPFunction{}
	}
	return mcpServerResp{
		Name:        s.Name,
		URL:         s.URL,
		Enabled:     s.Enabled,
		Description: s.Description,
		HasAuth:     s.AuthToken != "",
		LastSynced:  s.LastSynced,
		CreatedAt:   s.CreatedAt,
		UpdatedAt:   s.UpdatedAt,
		Functions:   funcs,
		Warning:     warning,
	}
}

// List returns all registered MCP servers with their discovered functions.
func (h *MCPServersHandler) List(w http.ResponseWriter, r *http.Request) {
	ws := httputil.WorkspaceFromContext(r.Context())
	servers, err := h.store.List(r.Context(), ws)
	if err != nil {
		httputil.WriteError(w, http.StatusInternalServerError, err.Error())
		return
	}
	funcsMap, err := h.store.ListAllFunctions(r.Context(), ws)
	if err != nil {
		httputil.WriteError(w, http.StatusInternalServerError, err.Error())
		return
	}
	out := make([]mcpServerResp, 0, len(servers))
	for _, s := range servers {
		out = append(out, toResp(s, funcsMap[s.Name], ""))
	}
	httputil.WriteJSON(w, http.StatusOK, out)
}

// Get returns one server by name.
func (h *MCPServersHandler) Get(w http.ResponseWriter, r *http.Request) {
	ws := httputil.WorkspaceFromContext(r.Context())
	name := r.PathValue("name")
	srv, err := h.store.Get(r.Context(), ws, name)
	if err != nil {
		httputil.WriteError(w, http.StatusNotFound, err.Error())
		return
	}
	funcs, err := h.store.ListFunctions(r.Context(), ws, name)
	if err != nil {
		httputil.WriteError(w, http.StatusInternalServerError, err.Error())
		return
	}
	httputil.WriteJSON(w, http.StatusOK, toResp(*srv, funcs, ""))
}

type createMCPServerBody struct {
	Name        string `json:"name"`
	URL         string `json:"url"`
	AuthToken   string `json:"auth_token"`
	Description string `json:"description"`
	Enabled     *bool  `json:"enabled"`
}

// Create registers a new MCP server, connects + discovers tools, and persists
// both the registration and the discovered functions. If discovery fails the
// row is still saved (so the admin can edit + retry), but a warning is returned.
func (h *MCPServersHandler) Create(w http.ResponseWriter, r *http.Request) {
	var body createMCPServerBody
	if err := httputil.ReadJSON(r, &body); err != nil {
		httputil.WriteError(w, http.StatusBadRequest, "invalid JSON body")
		return
	}
	body.Name = strings.TrimSpace(body.Name)
	body.URL = strings.TrimSpace(body.URL)
	if body.Name == "" || body.URL == "" {
		httputil.WriteError(w, http.StatusBadRequest, "name and url are required")
		return
	}

	ws := httputil.WorkspaceFromContext(r.Context())
	enabled := true
	if body.Enabled != nil {
		enabled = *body.Enabled
	}
	srv := store.MCPServer{
		WorkspaceID: ws,
		Name:        body.Name,
		URL:         body.URL,
		AuthToken:   body.AuthToken,
		Enabled:     enabled,
		Description: body.Description,
	}
	if err := h.store.Create(r.Context(), srv); err != nil {
		httputil.WriteError(w, http.StatusConflict, err.Error())
		return
	}

	warning := ""
	if enabled {
		ctx, cancel := context.WithTimeout(r.Context(), 30*time.Second)
		defer cancel()
		if err := h.manager.Sync(ctx, srv); err != nil {
			warning = "registered but discovery failed: " + err.Error()
		}
	}

	saved, _ := h.store.Get(r.Context(), ws, srv.Name)
	funcs, _ := h.store.ListFunctions(r.Context(), ws, srv.Name)
	if saved == nil {
		saved = &srv
	}
	httputil.WriteJSON(w, http.StatusCreated, toResp(*saved, funcs, warning))
}

type updateMCPServerBody struct {
	URL         *string `json:"url"`
	AuthToken   *string `json:"auth_token"`
	Description *string `json:"description"`
	Enabled     *bool   `json:"enabled"`
}

// Update modifies URL, auth, description, or enabled flag. After any change,
// the server is re-connected (or removed if disabled).
func (h *MCPServersHandler) Update(w http.ResponseWriter, r *http.Request) {
	ws := httputil.WorkspaceFromContext(r.Context())
	name := r.PathValue("name")
	existing, err := h.store.Get(r.Context(), ws, name)
	if err != nil {
		httputil.WriteError(w, http.StatusNotFound, err.Error())
		return
	}

	var body updateMCPServerBody
	if err := httputil.ReadJSON(r, &body); err != nil {
		httputil.WriteError(w, http.StatusBadRequest, "invalid JSON body")
		return
	}
	if body.URL != nil {
		existing.URL = strings.TrimSpace(*body.URL)
	}
	if body.AuthToken != nil {
		existing.AuthToken = *body.AuthToken
	}
	if body.Description != nil {
		existing.Description = *body.Description
	}
	if body.Enabled != nil {
		existing.Enabled = *body.Enabled
	}
	if existing.URL == "" {
		httputil.WriteError(w, http.StatusBadRequest, "url cannot be empty")
		return
	}
	if err := validateMCPURL(existing.URL); err != nil {
		httputil.WriteError(w, http.StatusBadRequest, err.Error())
		return
	}

	if err := h.store.Update(r.Context(), *existing); err != nil {
		httputil.WriteError(w, http.StatusInternalServerError, err.Error())
		return
	}

	warning := ""
	if existing.Enabled {
		ctx, cancel := context.WithTimeout(r.Context(), 30*time.Second)
		defer cancel()
		if err := h.manager.Sync(ctx, *existing); err != nil {
			warning = "saved but discovery failed: " + err.Error()
		}
	} else {
		h.manager.Remove(r.Context(), ws, existing.Name)
	}

	saved, _ := h.store.Get(r.Context(), ws, existing.Name)
	funcs, _ := h.store.ListFunctions(r.Context(), ws, existing.Name)
	if saved == nil {
		saved = existing
	}
	httputil.WriteJSON(w, http.StatusOK, toResp(*saved, funcs, warning))
}

// Refresh forces re-discovery of an existing server.
func (h *MCPServersHandler) Refresh(w http.ResponseWriter, r *http.Request) {
	ws := httputil.WorkspaceFromContext(r.Context())
	name := r.PathValue("name")
	srv, err := h.store.Get(r.Context(), ws, name)
	if err != nil {
		httputil.WriteError(w, http.StatusNotFound, err.Error())
		return
	}
	if !srv.Enabled {
		httputil.WriteError(w, http.StatusBadRequest, "server is disabled")
		return
	}
	ctx, cancel := context.WithTimeout(r.Context(), 30*time.Second)
	defer cancel()
	warning := ""
	if err := h.manager.Sync(ctx, *srv); err != nil {
		warning = err.Error()
	}
	updated, _ := h.store.Get(r.Context(), ws, name)
	funcs, _ := h.store.ListFunctions(r.Context(), ws, name)
	if updated == nil {
		updated = srv
	}
	httputil.WriteJSON(w, http.StatusOK, toResp(*updated, funcs, warning))
}

// SetFunctionEnabled toggles a single discovered function on/off without
// removing its cached row. Body: { "enabled": true|false }.
func (h *MCPServersHandler) SetFunctionEnabled(w http.ResponseWriter, r *http.Request) {
	ws := httputil.WorkspaceFromContext(r.Context())
	serverName := r.PathValue("name")
	funcName := r.PathValue("func")
	var body struct {
		Enabled *bool `json:"enabled"`
	}
	if err := httputil.ReadJSON(r, &body); err != nil || body.Enabled == nil {
		httputil.WriteError(w, http.StatusBadRequest, "enabled (bool) is required")
		return
	}
	if err := h.manager.SetFunctionEnabled(r.Context(), ws, serverName, funcName, *body.Enabled); err != nil {
		httputil.WriteError(w, http.StatusInternalServerError, err.Error())
		return
	}
	funcs, _ := h.store.ListFunctions(r.Context(), ws, serverName)
	for _, f := range funcs {
		if f.Name == funcName {
			httputil.WriteJSON(w, http.StatusOK, f)
			return
		}
	}
	httputil.WriteError(w, http.StatusNotFound, "function not found")
}

// Delete removes an MCP server registration. Tools backed by this server are
// unregistered from the in-memory registry, the mcp_servers row is deleted
// (cascading mcp_functions), and any "mcp:<server>:*" RBAC permissions are
// stripped from every role so they don't linger as ghost entries.
func (h *MCPServersHandler) Delete(w http.ResponseWriter, r *http.Request) {
	ws := httputil.WorkspaceFromContext(r.Context())
	name := r.PathValue("name")
	if _, err := h.store.Get(r.Context(), ws, name); err != nil {
		httputil.WriteError(w, http.StatusNotFound, err.Error())
		return
	}
	h.manager.Remove(r.Context(), ws, name)
	if err := h.store.Delete(r.Context(), ws, name); err != nil {
		httputil.WriteError(w, http.StatusInternalServerError, err.Error())
		return
	}
	if h.enforcer != nil {
		removed, err := h.enforcer.RemovePermissionsByPrefix(ws, "mcp:"+name+":")
		if err != nil {
			slog.WarnContext(r.Context(), "rbac.cleanup_mcp_perms_failed",
				"server", name, "error", err)
		} else if removed > 0 {
			slog.InfoContext(r.Context(), "rbac.removed_mcp_perms",
				"server", name, "count", removed)
		}
	}
	w.WriteHeader(http.StatusNoContent)
}
