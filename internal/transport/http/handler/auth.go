package handler

import (
	"net/http"
	"time"

	"gitlab.zalopay.vn/fin/lending/lending-claw/pkg/httputil"
)

// SetTokenHandler validates a JWT and sets auth cookies.
type SetTokenHandler struct {
	secret []byte
}

// NewSetTokenHandler creates a SetTokenHandler.
func NewSetTokenHandler(secret []byte) *SetTokenHandler {
	return &SetTokenHandler{secret: secret}
}

func (h *SetTokenHandler) Handle(w http.ResponseWriter, r *http.Request) {
	var body struct {
		Token string `json:"token"`
	}
	if err := httputil.ReadJSON(r, &body); err != nil || body.Token == "" {
		httputil.WriteError(w, http.StatusBadRequest, "missing token")
		return
	}

	claims, err := httputil.ParseJWT(body.Token, h.secret)
	if err != nil {
		httputil.WriteError(w, http.StatusUnauthorized, "invalid token")
		return
	}

	// Cookie MaxAge from JWT exp
	maxAge := int(time.Until(claims.ExpiresAt.Time).Seconds())
	if maxAge <= 0 {
		httputil.WriteError(w, http.StatusUnauthorized, "token expired")
		return
	}

	setAuthCookies(w, body.Token, claims.Sub, maxAge)

	httputil.WriteJSON(w, http.StatusOK, map[string]any{
		"sub":  claims.Sub,
		"name": claims.Name,
		"role": claims.Role,
		"exp":  claims.ExpiresAt.Unix(),
	})
}

// setAuthCookies sets the JWT (HttpOnly) and sub (JS-readable) cookies that the
// frontend relies on, with the given MaxAge in seconds. Shared by the manual
// set-token flow and the CAS SSO flow so cookie semantics stay identical.
func setAuthCookies(w http.ResponseWriter, token, sub string, maxAge int) {
	// HttpOnly cookie for the JWT (not readable by JS)
	http.SetCookie(w, &http.Cookie{
		Name:     httputil.CookieToken,
		Value:    token,
		Path:     "/",
		MaxAge:   maxAge,
		HttpOnly: true,
		SameSite: http.SameSiteLaxMode,
	})

	// Readable cookie for the sub (UI display)
	http.SetCookie(w, &http.Cookie{
		Name:     httputil.CookieSub,
		Value:    sub,
		Path:     "/",
		MaxAge:   maxAge,
		HttpOnly: false,
		SameSite: http.SameSiteLaxMode,
	})
}

// LogoutHandler clears auth cookies.
func LogoutHandler(w http.ResponseWriter, r *http.Request) {
	http.SetCookie(w, &http.Cookie{
		Name:     httputil.CookieToken,
		Value:    "",
		Path:     "/",
		MaxAge:   -1,
		HttpOnly: true,
		SameSite: http.SameSiteLaxMode,
	})
	http.SetCookie(w, &http.Cookie{
		Name:     httputil.CookieSub,
		Value:    "",
		Path:     "/",
		MaxAge:   -1,
		HttpOnly: false,
		SameSite: http.SameSiteLaxMode,
	})
	w.WriteHeader(http.StatusNoContent)
}
