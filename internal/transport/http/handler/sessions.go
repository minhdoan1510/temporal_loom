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

// List returns all sessions in the active workspace filtered by kind.
func (h *SessionsHandler) List(w http.ResponseWriter, r *http.Request) {
	kind := r.URL.Query().Get("kind")
	if kind == "" {
		kind = "user"
	}
	sessions := h.sessions.List(httputil.WorkspaceFromContext(r.Context()), kind)
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
		session = &store.SessionData{
			Key:      key,
			Title:    store.DefaultSessionTitle,
			Messages: []providers.Message{},
		}
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

// Update updates a session's messages and metadata.
func (h *SessionsHandler) Update(w http.ResponseWriter, r *http.Request) {
	key := r.PathValue("key")
	if key == "" {
		httputil.WriteError(w, http.StatusBadRequest, "session key is required")
		return
	}

	var req struct {
		Messages  []providers.Message `json:"messages"`
		ExtraMeta map[string]string   `json:"extra_meta"`
	}
	if err := httputil.ReadJSON(r, &req); err != nil {
		httputil.WriteError(w, http.StatusBadRequest, "invalid JSON body")
		return
	}
	if !isTitleOnlyUpdate(req.Messages, req.ExtraMeta) && !requestHasPermission(r, "tab:sessions:create") {
		httputil.WriteError(w, http.StatusForbidden, "You are not authorized to access this resource: tab:sessions:create")
		return
	}

	workspaceID := httputil.WorkspaceFromContext(r.Context())
	if _, ok := h.sessions.Get(workspaceID, key); !ok {
		httputil.WriteError(w, http.StatusNotFound, "session not found")
		return
	}

	if req.Messages != nil {
		h.sessions.SetMessages(workspaceID, key, req.Messages)
	}

	for k, v := range req.ExtraMeta {
		h.sessions.SetSessionMetaValue(workspaceID, key, k, v)
	}

	if err := h.sessions.Save(workspaceID, key); err != nil {
		httputil.WriteError(w, http.StatusInternalServerError, "failed to save session: "+err.Error())
		return
	}

	// Retrieve updated session to return
	updated, _ := h.sessions.Get(workspaceID, key)
	httputil.WriteJSON(w, http.StatusOK, updated)
}

func isTitleOnlyUpdate(messages []providers.Message, meta map[string]string) bool {
	if messages != nil {
		return false
	}
	for key := range meta {
		if key != "title" {
			return false
		}
	}
	return true
}

func requestHasPermission(r *http.Request, resource string) bool {
	perms := httputil.PermissionsFromContext(r.Context())
	if perms == nil {
		return true
	}
	for _, perm := range perms {
		if perm == resource {
			return true
		}
	}
	return false
}
