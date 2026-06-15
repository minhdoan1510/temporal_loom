package middleware

import (
	"net/http"
	"strings"

	"gitlab.zalopay.vn/fin/lending/lending-claw/internal/tools"
	"gitlab.zalopay.vn/fin/lending/lending-claw/pkg/httputil"
	"gitlab.zalopay.vn/fin/lending/lending-claw/pkg/rbac"
)

// RBACMiddleware resolves user permissions via the Casbin enforcer and stores
// them in context. In bootstrap mode (nil enforcer or no roles) all requests
// pass through with nil permissions (full access).
func RBACMiddleware(enforcer *rbac.Enforcer) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		if enforcer == nil {
			return next
		}
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			ctx := r.Context()

			// Skip non-API paths
			if !strings.HasPrefix(r.URL.Path, "/api/") {
				next.ServeHTTP(w, r)
				return
			}

			claims := httputil.ClaimsFromContext(ctx)
			if claims == nil {
				next.ServeHTTP(w, r)
				return
			}
			dom := httputil.WorkspaceFromContext(ctx)
			// In a workspace with no roles defined, bypass RBAC (full access).
			if dom == "" || !enforcer.HasRoles(dom) {
				next.ServeHTTP(w, r)
				return
			}
			perms := enforcer.GetUserPermissions(claims.Sub, dom)
			ctx = httputil.ContextWithPermissions(ctx, perms)

			// Extract tool:* permissions and set AllowedTools in context
			allowedTools := rbac.FilterToolPermissions(perms)
			ctx = tools.WithAllowedTools(ctx, allowedTools)

			next.ServeHTTP(w, r.WithContext(ctx))
		})
	}
}

// RequirePermission wraps a handler and checks that the user has the given
// resource permission. In bootstrap mode (nil permissions) all access is allowed.
func RequirePermission(resource string, handler http.HandlerFunc) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		perms := httputil.PermissionsFromContext(r.Context())
		if perms == nil {
			// Bootstrap mode — no RBAC enforcement
			handler(w, r)
			return
		}
		for _, p := range perms {
			if p == resource {
				handler(w, r)
				return
			}
		}
		httputil.WriteError(w, http.StatusForbidden, "You are not authorized to access this resource: "+resource)
	}
}
