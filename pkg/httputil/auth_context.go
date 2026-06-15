package httputil

import (
	"context"
	"net/http"
	"time"

	"github.com/golang-jwt/jwt/v5"
)

const (
	CookieToken = "token"
	CookieSub   = "sub"
)

// Claims holds the JWT claims extracted from a verified token.
type Claims struct {
	Sub  string `json:"sub"`
	Name string `json:"name"`
	Role string `json:"role"`
	jwt.RegisteredClaims
}

type claimsKey struct{}

// ContextWithClaims returns a context carrying the given JWT claims.
func ContextWithClaims(ctx context.Context, c *Claims) context.Context {
	return context.WithValue(ctx, claimsKey{}, c)
}

// ClaimsFromContext returns the JWT claims attached to ctx, or nil if absent.
func ClaimsFromContext(ctx context.Context) *Claims {
	c, _ := ctx.Value(claimsKey{}).(*Claims)
	return c
}

type workspaceKey struct{}

// ContextWithWorkspace returns a context carrying the active workspace id
// (the Casbin domain), resolved by WorkspaceMiddleware.
func ContextWithWorkspace(ctx context.Context, workspaceID string) context.Context {
	return context.WithValue(ctx, workspaceKey{}, workspaceID)
}

// WorkspaceFromContext returns the active workspace id, or "" if absent.
func WorkspaceFromContext(ctx context.Context) string {
	id, _ := ctx.Value(workspaceKey{}).(string)
	return id
}

type permissionsKey struct{}

// ContextWithPermissions returns a context carrying the given permissions list.
func ContextWithPermissions(ctx context.Context, perms []string) context.Context {
	return context.WithValue(ctx, permissionsKey{}, perms)
}

// PermissionsFromContext returns the user's permissions set by RBACMiddleware.
// Returns nil in bootstrap mode (no RBAC enforcement).
func PermissionsFromContext(ctx context.Context) []string {
	perms, _ := ctx.Value(permissionsKey{}).([]string)
	return perms
}

// ParseJWT validates a JWT string and returns claims.
// Requires exp claim; expired tokens are rejected automatically by jwt/v5.
func ParseJWT(tokenStr string, secret []byte) (*Claims, error) {
	claims := &Claims{}
	token, err := jwt.ParseWithClaims(tokenStr, claims,
		func(t *jwt.Token) (any, error) {
			if _, ok := t.Method.(*jwt.SigningMethodHMAC); !ok {
				return nil, jwt.ErrSignatureInvalid
			}
			return secret, nil
		},
		jwt.WithExpirationRequired(),
	)
	if err != nil {
		return nil, err
	}
	if !token.Valid {
		return nil, jwt.ErrSignatureInvalid
	}
	return claims, nil
}

// IssueJWT mints an HMAC-SHA256 signed JWT for the given identity, valid for
// ttl. It returns the signed token string and the populated claims (whose
// ExpiresAt drives the auth-cookie MaxAge).
func IssueJWT(secret []byte, sub, name, role string, ttl time.Duration) (string, *Claims, error) {
	now := time.Now()
	claims := &Claims{
		Sub:  sub,
		Name: name,
		Role: role,
		RegisteredClaims: jwt.RegisteredClaims{
			Subject:   sub,
			IssuedAt:  jwt.NewNumericDate(now),
			ExpiresAt: jwt.NewNumericDate(now.Add(ttl)),
		},
	}
	token := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
	signed, err := token.SignedString(secret)
	if err != nil {
		return "", nil, err
	}
	return signed, claims, nil
}

// ResponseWriter wraps http.ResponseWriter to capture the status code and
// number of bytes written for access logging.
type ResponseWriter struct {
	http.ResponseWriter
	Status int
	Bytes  int
}

func (rw *ResponseWriter) WriteHeader(code int) {
	rw.Status = code
	rw.ResponseWriter.WriteHeader(code)
}

func (rw *ResponseWriter) Write(b []byte) (int, error) {
	n, err := rw.ResponseWriter.Write(b)
	rw.Bytes += n
	return n, err
}
