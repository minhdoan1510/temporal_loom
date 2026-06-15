package handler

import (
	"log/slog"
	"net/http"
	"time"

	"gitlab.zalopay.vn/fin/lending/lending-claw/internal/services/cas"
	"gitlab.zalopay.vn/fin/lending/lending-claw/pkg/httputil"
)

// CASHandler validates a CAS service ticket, mints a JWT for the authenticated
// user, and sets the same auth cookies as the manual set-token flow.
type CASHandler struct {
	cas    *cas.Client
	secret []byte
	ttl    time.Duration
}

// NewCASHandler creates a CASHandler. ttl is the minted-JWT lifetime; a
// non-positive ttl defaults to 24h.
func NewCASHandler(client *cas.Client, secret []byte, ttl time.Duration) *CASHandler {
	if ttl <= 0 {
		ttl = 24 * time.Hour
	}
	return &CASHandler{cas: client, secret: secret, ttl: ttl}
}

func (h *CASHandler) Login(w http.ResponseWriter, r *http.Request) {
	var body struct {
		Ticket  string `json:"ticket"`
		Service string `json:"service"`
	}
	if err := httputil.ReadJSON(r, &body); err != nil || body.Ticket == "" || body.Service == "" {
		httputil.WriteError(w, http.StatusBadRequest, "missing ticket or service")
		return
	}

	ctx := r.Context()
	user, err := h.cas.ValidateTicket(ctx, body.Service, body.Ticket)
	if err != nil {
		slog.WarnContext(ctx, "security.auth_failed", "reason", "cas_validate", "error", err, "remote", r.RemoteAddr)
		httputil.WriteError(w, http.StatusUnauthorized, "cas validation failed")
		return
	}

	token, claims, err := httputil.IssueJWT(h.secret, user, user, "", h.ttl)
	if err != nil {
		slog.ErrorContext(ctx, "cas.auth_failed", "error", err)
		httputil.WriteError(w, http.StatusInternalServerError, "cas.auth_failed")
		return
	}

	maxAge := int(time.Until(claims.ExpiresAt.Time).Seconds())
	setAuthCookies(w, token, claims.Sub, maxAge)

	httputil.WriteJSON(w, http.StatusOK, map[string]any{
		"sub": claims.Sub,
		"exp": claims.ExpiresAt.Unix(),
	})
}
