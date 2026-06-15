package middleware

import (
	"log/slog"
	"net/http"
	"strings"

	"gitlab.zalopay.vn/fin/lending/lending-claw/pkg/httputil"
	"gitlab.zalopay.vn/fin/lending/lending-claw/pkg/telemetry"
)

// authSkipPaths are API paths that don't require authentication.
var authSkipPaths = map[string]bool{
	"/api/v1/set-token": true,
	"/api/v1/logout":    true,
	"/api/v1/sso/cas":   true,
}

// AuthMiddleware verifies JWT bearer tokens using HMAC-SHA256.
// Checks Authorization header first, then falls back to the "token" cookie.
// If jwtSecret is empty, authentication is disabled (all requests pass through).
func AuthMiddleware(jwtSecret string) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		if jwtSecret == "" {
			return next // no auth configured
		}
		secretBytes := []byte(jwtSecret)

		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			ctx := r.Context()

			// Skip auth for health check and static assets
			if r.URL.Path == "/health" || !strings.HasPrefix(r.URL.Path, "/api/") {
				next.ServeHTTP(w, r)
				return
			}

			// Skip auth for public API paths (set-token, logout)
			if authSkipPaths[r.URL.Path] {
				next.ServeHTTP(w, r)
				return
			}

			// Try Authorization header first, then cookie
			tokenStr := httputil.ExtractBearerToken(r)
			if tokenStr == "" {
				if c, err := r.Cookie(httputil.CookieToken); err == nil {
					tokenStr = c.Value
				}
			}

			if tokenStr == "" {
				slog.WarnContext(ctx, "security.auth_failed", "reason", "missing_token", "path", r.URL.Path, "remote", r.RemoteAddr)
				httputil.WriteError(w, http.StatusUnauthorized, "unauthorized")
				return
			}

			claims, err := httputil.ParseJWT(tokenStr, secretBytes)
			if err != nil {
				slog.WarnContext(ctx, "security.auth_failed", "reason", "invalid_jwt", "error", err, "path", r.URL.Path, "remote", r.RemoteAddr)
				httputil.WriteError(w, http.StatusUnauthorized, "unauthorized")
				return
			}

			ctx = httputil.ContextWithClaims(ctx, claims)
			ctx = telemetry.ContextWithSub(ctx, claims.Sub)
			next.ServeHTTP(w, r.WithContext(ctx))
		})
	}
}
