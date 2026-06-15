package handler

import (
	"net/http"

	"gitlab.zalopay.vn/fin/lending/lending-claw/internal/providers"
	"gitlab.zalopay.vn/fin/lending/lending-claw/internal/store"
	"gitlab.zalopay.vn/fin/lending/lending-claw/pkg/httputil"
)

// SessionsHandler handles /api/v1/sessions endpoints.
type SessionsHandler struct {
	sessions store.SessionStore
}

// NewSessionsHandler creates a SessionsHandler.
func NewSessionsHandler(sessions store.SessionStore) *SessionsHandler {
	return &SessionsHandler{sessions: sessions}
}

// List returns all sessions in the active workspace.
func (h *SessionsHandler) List(w http.ResponseWriter, r *http.Request) {
	sessions := h.sessions.List(httputil.WorkspaceFromContext(r.Context()))
	httputil.WriteJSON(w, http.StatusOK, sessions)
}

// Get returns a single session by key.
func (h *SessionsHandler) Get(w http.ResponseWriter, r *http.Request) {
	key := r.PathValue("key")
	if key == "" {
		httputil.WriteError(w, http.StatusBadRequest, "session key is required")
		return
	}

	// Read-only: never create a session here. A session is only created when
	// the user actually sends a message (POST /agent/run). If it doesn't exist
	// yet, return an ephemeral empty session so the UI can render a blank chat.
	session, ok := h.sessions.Get(httputil.WorkspaceFromContext(r.Context()), key)
	if !ok {
		session = &store.SessionData{Key: key, Messages: []providers.Message{}}
	}
	httputil.WriteJSON(w, http.StatusOK, session)
}

// Delete removes a session by key.
func (h *SessionsHandler) Delete(w http.ResponseWriter, r *http.Request) {
	key := r.PathValue("key")
	if key == "" {
		httputil.WriteError(w, http.StatusBadRequest, "session key is required")
		return
	}

	if err := h.sessions.Delete(httputil.WorkspaceFromContext(r.Context()), key); err != nil {
		httputil.WriteError(w, http.StatusInternalServerError, "failed to delete session: "+err.Error())
		return
	}

	httputil.WriteJSON(w, http.StatusOK, map[string]string{"status": "deleted"})
}
