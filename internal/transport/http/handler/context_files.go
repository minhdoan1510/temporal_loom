package handler

import (
	"net/http"

	"gitlab.zalopay.vn/fin/lending/lending-claw/internal/store"
	"gitlab.zalopay.vn/fin/lending/lending-claw/pkg/httputil"
)

// ContextFilesHandler handles /api/v1/context-files endpoints.
type ContextFilesHandler struct {
	contextFiles store.ContextFileStore
}

// NewContextFilesHandler creates a ContextFilesHandler.
func NewContextFilesHandler(contextFiles store.ContextFileStore) *ContextFilesHandler {
	return &ContextFilesHandler{contextFiles: contextFiles}
}

// List returns all context files.
func (h *ContextFilesHandler) List(w http.ResponseWriter, r *http.Request) {
	files, err := h.contextFiles.List(r.Context(), httputil.WorkspaceFromContext(r.Context()))
	if err != nil {
		httputil.WriteError(w, http.StatusInternalServerError, "failed to list context files: "+err.Error())
		return
	}
	httputil.WriteJSON(w, http.StatusOK, files)
}

// Create creates a new context file.
func (h *ContextFilesHandler) Create(w http.ResponseWriter, r *http.Request) {
	var file store.ContextFile
	if err := httputil.ReadJSON(r, &file); err != nil {
		httputil.WriteError(w, http.StatusBadRequest, "invalid JSON body")
		return
	}
	if file.Path == "" {
		httputil.WriteError(w, http.StatusBadRequest, "path is required")
		return
	}
	if file.Scope == "" {
		file.Scope = "global"
	}

	if err := h.contextFiles.Upsert(r.Context(), httputil.WorkspaceFromContext(r.Context()), &file); err != nil {
		httputil.WriteError(w, http.StatusInternalServerError, "failed to create context file: "+err.Error())
		return
	}
	httputil.WriteJSON(w, http.StatusCreated, file)
}

// Delete removes a context file by scope + path (query params).
func (h *ContextFilesHandler) Delete(w http.ResponseWriter, r *http.Request) {
	scope := r.URL.Query().Get("scope")
	path := r.URL.Query().Get("path")
	if path == "" {
		httputil.WriteError(w, http.StatusBadRequest, "path query param is required")
		return
	}
	if scope == "" {
		scope = "global"
	}

	userID := r.URL.Query().Get("user_id")
	var userIDPtr *string
	if userID != "" {
		userIDPtr = &userID
	}

	if err := h.contextFiles.Delete(r.Context(), httputil.WorkspaceFromContext(r.Context()), scope, userIDPtr, path); err != nil {
		httputil.WriteError(w, http.StatusInternalServerError, "failed to delete context file: "+err.Error())
		return
	}
	httputil.WriteJSON(w, http.StatusOK, map[string]string{"status": "deleted"})
}

// Upsert creates or updates a context file.
func (h *ContextFilesHandler) Upsert(w http.ResponseWriter, r *http.Request) {
	var file store.ContextFile
	if err := httputil.ReadJSON(r, &file); err != nil {
		httputil.WriteError(w, http.StatusBadRequest, "invalid JSON body")
		return
	}
	if file.Path == "" {
		httputil.WriteError(w, http.StatusBadRequest, "path is required")
		return
	}
	if file.Scope == "" {
		file.Scope = "global"
	}

	if err := h.contextFiles.Upsert(r.Context(), httputil.WorkspaceFromContext(r.Context()), &file); err != nil {
		httputil.WriteError(w, http.StatusInternalServerError, "failed to upsert context file: "+err.Error())
		return
	}
	httputil.WriteJSON(w, http.StatusOK, file)
}
