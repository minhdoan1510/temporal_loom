package http

import (
	"net/http"
	"os"
	"path/filepath"
	"strings"

	handler2 "gitlab.zalopay.vn/fin/lending/lending-claw/internal/transport/http/handler"
	middleware2 "gitlab.zalopay.vn/fin/lending/lending-claw/internal/transport/http/middleware"
	"go.opentelemetry.io/otel/trace"

	"gitlab.zalopay.vn/fin/lending/lending-claw/internal/agent"
	"gitlab.zalopay.vn/fin/lending/lending-claw/internal/config"
	mcpmgr "gitlab.zalopay.vn/fin/lending/lending-claw/internal/mcp"
	"gitlab.zalopay.vn/fin/lending/lending-claw/internal/services/cas"
	"gitlab.zalopay.vn/fin/lending/lending-claw/internal/skills"
	"gitlab.zalopay.vn/fin/lending/lending-claw/internal/store"
	"gitlab.zalopay.vn/fin/lending/lending-claw/internal/tools"
	"gitlab.zalopay.vn/fin/lending/lending-claw/pkg/httputil"
	"gitlab.zalopay.vn/fin/lending/lending-claw/pkg/rbac"
)

// wsPrefix is the path prefix for all workspace-scoped resource routes.
const wsPrefix = "/api/v1/workspaces/{wsID}"

// RouterDeps holds the dependencies needed by HTTP handlers.
type RouterDeps struct {
	Stores         *store.Stores
	Loop           *agent.Loop
	JWTSecret      string
	AllowedOrigins []string
	WebDir         string         // path to FE dist/ folder; empty disables static serving
	Tracer         trace.Tracer   // OTel tracer; nil disables tracing middleware
	Enforcer       *rbac.Enforcer // RBAC enforcer; nil disables RBAC
	ToolsReg       *tools.Registry
	MCPManager     *mcpmgr.Manager
	Config         *config.Config // needed for knowledge sync
	SkillsCache    *skills.Cache  // optional: invalidated after skill mutations so the agent loop sees changes immediately
}

// NewRouter creates an http.Handler with all API routes registered.
func NewRouter(deps RouterDeps) http.Handler {
	mux := http.NewServeMux()

	// Health check
	mux.HandleFunc("GET /health", func(w http.ResponseWriter, r *http.Request) {
		httputil.WriteJSON(w, http.StatusOK, map[string]string{"status": "ok"})
	})

	// Workspace management (NOT under {wsID}). Creating/listing is open to any
	// authenticated user; member-scoped routes are guarded by WorkspaceMiddleware.
	if deps.Stores.Workspaces != nil {
		wsH := handler2.NewWorkspacesHandler(deps.Stores.Workspaces, deps.Stores.ContextFiles, deps.Enforcer, deps.ToolsReg)
		mux.HandleFunc("GET /api/v1/workspaces", wsH.List)
		mux.HandleFunc("POST /api/v1/workspaces", wsH.Create)
		mux.HandleFunc("GET /api/v1/workspaces/{wsID}", wsH.Get)
		mux.HandleFunc("PUT /api/v1/workspaces/{wsID}", middleware2.RequirePermission("tab:workspace:update", wsH.Update))
		mux.HandleFunc("DELETE /api/v1/workspaces/{wsID}", wsH.Delete)
		mux.HandleFunc("GET /api/v1/workspaces/{wsID}/members", wsH.ListMembers)
		mux.HandleFunc("POST /api/v1/workspaces/{wsID}/members", middleware2.RequirePermission("tab:workspace:update", wsH.AddMember))
		mux.HandleFunc("PUT /api/v1/workspaces/{wsID}/members/{sub}/roles", middleware2.RequirePermission("tab:workspace:update", wsH.SetMemberRoles))
		mux.HandleFunc("DELETE /api/v1/workspaces/{wsID}/members/{sub}", middleware2.RequirePermission("tab:workspace:update", wsH.RemoveMember))
	}

	// Agent
	agentH := handler2.NewAgentHandler(deps.Loop)
	mux.HandleFunc("POST "+wsPrefix+"/agent/run", middleware2.RequirePermission("tab:sessions:create", agentH.Run))

	// Sessions
	sessH := handler2.NewSessionsHandler(deps.Stores.Sessions)
	mux.HandleFunc("GET "+wsPrefix+"/sessions", middleware2.RequirePermission("tab:sessions:read", sessH.List))
	mux.HandleFunc("GET "+wsPrefix+"/sessions/{key}", middleware2.RequirePermission("tab:sessions:read", sessH.Get))
	mux.HandleFunc("DELETE "+wsPrefix+"/sessions/{key}", middleware2.RequirePermission("tab:sessions:delete", sessH.Delete))

	// Skills
	skillsH := handler2.NewSkillsHandler(deps.Stores.Skills, deps.SkillsCache)
	mux.HandleFunc("GET "+wsPrefix+"/skills", middleware2.RequirePermission("tab:skills:read", skillsH.List))
	mux.HandleFunc("POST "+wsPrefix+"/skills", middleware2.RequirePermission("tab:skills:create", skillsH.Create))
	mux.HandleFunc("GET "+wsPrefix+"/skills/{id}", middleware2.RequirePermission("tab:skills:read", skillsH.Get))
	mux.HandleFunc("PUT "+wsPrefix+"/skills/{id}", middleware2.RequirePermission("tab:skills:update", skillsH.Update))
	mux.HandleFunc("DELETE "+wsPrefix+"/skills/{id}", middleware2.RequirePermission("tab:skills:delete", skillsH.Delete))

	// Context Files
	cfH := handler2.NewContextFilesHandler(deps.Stores.ContextFiles)
	mux.HandleFunc("GET "+wsPrefix+"/context-files", middleware2.RequirePermission("tab:context-files:read", cfH.List))
	mux.HandleFunc("POST "+wsPrefix+"/context-files", middleware2.RequirePermission("tab:context-files:create", cfH.Create))
	mux.HandleFunc("PUT "+wsPrefix+"/context-files", middleware2.RequirePermission("tab:context-files:update", cfH.Upsert))
	mux.HandleFunc("DELETE "+wsPrefix+"/context-files", middleware2.RequirePermission("tab:context-files:delete", cfH.Delete))

	// Knowledge
	knowledgeH := handler2.NewKnowledgeHandler(deps.Stores.Knowledge, deps.Stores.Workspaces, deps.Config)
	mux.HandleFunc("GET "+wsPrefix+"/knowledge", middleware2.RequirePermission("tab:knowledge:read", knowledgeH.List))
	mux.HandleFunc("POST "+wsPrefix+"/knowledge", middleware2.RequirePermission("tab:knowledge:create", knowledgeH.Create))
	mux.HandleFunc("GET "+wsPrefix+"/knowledge/{id}", middleware2.RequirePermission("tab:knowledge:read", knowledgeH.Get))
	mux.HandleFunc("PUT "+wsPrefix+"/knowledge/{id}", middleware2.RequirePermission("tab:knowledge:update", knowledgeH.Update))
	mux.HandleFunc("DELETE "+wsPrefix+"/knowledge/{id}", middleware2.RequirePermission("tab:knowledge:delete", knowledgeH.Delete))
	mux.HandleFunc("POST "+wsPrefix+"/knowledge/{id}/sync", middleware2.RequirePermission("tab:knowledge:update", knowledgeH.Sync))

	// RBAC management (per workspace)
	if deps.Enforcer != nil && deps.ToolsReg != nil {
		rbacH := handler2.NewRBACHandler(deps.Enforcer, deps.ToolsReg)
		mux.HandleFunc("GET "+wsPrefix+"/rbac/me", rbacH.Me)
		mux.HandleFunc("GET "+wsPrefix+"/rbac/resources", middleware2.RequirePermission("tab:roles:read", rbacH.Resources))
		mux.HandleFunc("GET "+wsPrefix+"/rbac/roles", middleware2.RequirePermission("tab:roles:read", rbacH.ListRoles))
		mux.HandleFunc("POST "+wsPrefix+"/rbac/roles", middleware2.RequirePermission("tab:roles:create", rbacH.CreateRole))
		mux.HandleFunc("PUT "+wsPrefix+"/rbac/roles/{name}", middleware2.RequirePermission("tab:roles:update", rbacH.UpdateRole))
		mux.HandleFunc("DELETE "+wsPrefix+"/rbac/roles/{name}", middleware2.RequirePermission("tab:roles:delete", rbacH.DeleteRole))
	}

	// MCP server management (per workspace)
	if deps.MCPManager != nil && deps.Stores.MCPServers != nil {
		mcpH := handler2.NewMCPServersHandler(deps.Stores.MCPServers, deps.MCPManager, deps.Enforcer)
		mux.HandleFunc("GET "+wsPrefix+"/mcp/servers", middleware2.RequirePermission("tab:mcp:read", mcpH.List))
		mux.HandleFunc("GET "+wsPrefix+"/mcp/servers/{name}", middleware2.RequirePermission("tab:mcp:read", mcpH.Get))
		mux.HandleFunc("POST "+wsPrefix+"/mcp/servers", middleware2.RequirePermission("tab:mcp:create", mcpH.Create))
		mux.HandleFunc("PUT "+wsPrefix+"/mcp/servers/{name}", middleware2.RequirePermission("tab:mcp:update", mcpH.Update))
		mux.HandleFunc("POST "+wsPrefix+"/mcp/servers/{name}/refresh", middleware2.RequirePermission("tab:mcp:update", mcpH.Refresh))
		mux.HandleFunc("PATCH "+wsPrefix+"/mcp/servers/{name}/functions/{func}", middleware2.RequirePermission("tab:mcp:update", mcpH.SetFunctionEnabled))
		mux.HandleFunc("DELETE "+wsPrefix+"/mcp/servers/{name}", middleware2.RequirePermission("tab:mcp:delete", mcpH.Delete))
	}

	// Auth (public — skipped by AuthMiddleware)
	if deps.JWTSecret != "" {
		setTokenH := handler2.NewSetTokenHandler([]byte(deps.JWTSecret))
		mux.HandleFunc("POST /api/v1/set-token", setTokenH.Handle)
		mux.HandleFunc("POST /api/v1/logout", handler2.LogoutHandler)

		// CAS SSO login (public — also skipped by AuthMiddleware).
		if deps.Config != nil && deps.Config.CAS.BaseURL != "" {
			casH := handler2.NewCASHandler(cas.New(deps.Config.CAS.BaseURL, deps.Config.CAS.Proxy), []byte(deps.JWTSecret), deps.Config.CAS.TokenTTL)
			mux.HandleFunc("POST /api/v1/sso/cas", casH.Login)
		}
	}

	// SPA static file serving
	var h http.Handler = mux
	if deps.WebDir != "" {
		h = spaHandler(deps.WebDir, mux)
	}

	// Apply middleware (innermost first, outermost last):
	//   CORS → tracing → auth → logging → workspace → RBAC → handler
	// Workspace sits between auth (needs claims) and RBAC (needs the resolved
	// workspace domain). Logging sits below auth so user.sub is already in context.
	h = middleware2.RBACMiddleware(deps.Enforcer)(h)
	h = middleware2.WorkspaceMiddleware(deps.Stores.Workspaces)(h)
	h = middleware2.LoggingMiddleware()(h)
	h = middleware2.AuthMiddleware(deps.JWTSecret)(h)
	if deps.Tracer != nil {
		h = middleware2.TracingMiddleware(deps.Tracer)(h)
	}
	h = middleware2.CORSMiddleware(deps.AllowedOrigins)(h)

	return h
}

// spaHandler serves static files from webDir. If the requested path is not an
// API route and no matching file exists, it falls back to index.html for
// client-side routing.
func spaHandler(webDir string, api http.Handler) http.Handler {
	fs := http.FileServer(http.Dir(webDir))

	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		// API and health routes go to the mux
		if strings.HasPrefix(r.URL.Path, "/api/") || r.URL.Path == "/health" {
			api.ServeHTTP(w, r)
			return
		}

		// Try serving the exact file (JS, CSS, images, etc.)
		path := filepath.Join(webDir, filepath.Clean(r.URL.Path))
		if info, err := os.Stat(path); err == nil && !info.IsDir() {
			fs.ServeHTTP(w, r)
			return
		}

		// SPA fallback: serve index.html for all other routes
		http.ServeFile(w, r, filepath.Join(webDir, "index.html"))
	})
}
