package middleware

import (
	"log/slog"
	"net/http"
	"net/url"
	"strings"

	"gitlab.zalopay.vn/fin/lending/lending-claw/internal/store"
	"gitlab.zalopay.vn/fin/lending/lending-claw/internal/tools"
	"gitlab.zalopay.vn/fin/lending/lending-claw/pkg/httputil"
)

// wsRoutePrefix is the path prefix for workspace-scoped routes.
const wsRoutePrefix = "/api/v1/workspaces/"

// workspaceIDFromPath extracts the {wsID} segment from a workspace-scoped URL
// path. It parses the raw path directly because middleware runs before the
// ServeMux matches the route, so r.PathValue("wsID") is not yet populated.
// Returns "" for non-scoped paths (e.g. /api/v1/workspaces itself).
func workspaceIDFromPath(p string) string {
	if !strings.HasPrefix(p, wsRoutePrefix) {
		return ""
	}
	rest := strings.TrimPrefix(p, wsRoutePrefix)
	if i := strings.IndexByte(rest, '/'); i >= 0 {
		rest = rest[:i]
	}
	id, err := url.PathUnescape(rest)
	if err != nil {
		return rest
	}
	return id
}

// WorkspaceMiddleware resolves the {wsID} path value for workspace-scoped
// routes (/api/v1/workspaces/{wsID}/...), verifies the caller is a member, and
// injects the resolved workspace id into context (both the httputil and tools
// context keys). Non-workspace routes pass through untouched.
func WorkspaceMiddleware(workspaces store.WorkspaceStore) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		if workspaces == nil {
			return next
		}
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			ctx := r.Context()

			// Only applies to scoped routes: /api/v1/workspaces/{wsID}/...
			// Parsed from the raw path — PathValue isn't set until the mux
			// matches the route, which happens after this middleware runs.
			id := workspaceIDFromPath(r.URL.Path)
			if id == "" {
				next.ServeHTTP(w, r)
				return
			}

			ws, err := workspaces.Get(ctx, id)
			if err != nil {
				httputil.WriteError(w, http.StatusNotFound, "workspace not found")
				return
			}

			// Membership check (skipped in no-auth bootstrap mode where claims are nil).
			if claims := httputil.ClaimsFromContext(ctx); claims != nil {
				member, err := workspaces.IsMember(ctx, ws.ID, claims.Sub)
				if err != nil {
					httputil.WriteError(w, http.StatusInternalServerError, "failed to check workspace membership")
					return
				}
				if !member {
					// Migration continuity: pre-workspace everyone shared one
					// global space, now the default workspace — auto-enroll any
					// authenticated user into it. Other workspaces are gated.
					if ws.ID == store.DefaultWorkspaceID {
						if err := workspaces.AddMember(ctx, ws.ID, claims.Sub); err != nil {
							httputil.WriteError(w, http.StatusInternalServerError, "failed to join default workspace")
							return
						}
					} else {
						slog.WarnContext(ctx, "security.workspace_denied",
							"workspace", ws.ID, "user", claims.Sub, "path", r.URL.Path)
						httputil.WriteError(w, http.StatusForbidden, "you are not a member of this workspace")
						return
					}
				}
			}

			ctx = httputil.ContextWithWorkspace(ctx, ws.ID)
			ctx = tools.WithWorkspace(ctx, ws.ID)
			next.ServeHTTP(w, r.WithContext(ctx))
		})
	}
}
