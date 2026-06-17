package handler

import (
	"net/http"
	"strconv"
	"strings"

	"gitlab.zalopay.vn/fin/lending/lending-claw/internal/services/routines"
	"gitlab.zalopay.vn/fin/lending/lending-claw/internal/store"
	"gitlab.zalopay.vn/fin/lending/lending-claw/pkg/httputil"
)

type RoutinesHandler struct {
	svc *routines.Service
}

func NewRoutinesHandler(svc *routines.Service) *RoutinesHandler {
	return &RoutinesHandler{svc: svc}
}

func (h *RoutinesHandler) List(w http.ResponseWriter, r *http.Request) {
	wsID := httputil.WorkspaceFromContext(r.Context())
	items, err := h.svc.List(r.Context(), wsID)
	if err != nil {
		httputil.WriteError(w, http.StatusInternalServerError, "failed to list routines: "+err.Error())
		return
	}
	if items == nil {
		items = []store.Routine{}
	}
	httputil.WriteJSON(w, http.StatusOK, items)
}

func (h *RoutinesHandler) Create(w http.ResponseWriter, r *http.Request) {
	wsID := httputil.WorkspaceFromContext(r.Context())

	var body struct {
		Name          string  `json:"name"`
		Prompt        string  `json:"prompt"`
		SessionPrefix string  `json:"session_prefix,omitempty"`
		Enabled       *bool   `json:"enabled,omitempty"`
		ScheduleCron  *string `json:"schedule_cron,omitempty"`
		ScheduleTZ    string  `json:"schedule_tz,omitempty"`
		GenerateToken bool    `json:"generate_token"`
	}
	if err := httputil.ReadJSON(r, &body); err != nil {
		httputil.WriteError(w, http.StatusBadRequest, "invalid JSON body")
		return
	}

	enabled := true
	if body.Enabled != nil {
		enabled = *body.Enabled
	}

	routine := &store.Routine{
		Name:          body.Name,
		Prompt:        body.Prompt,
		SessionPrefix: body.SessionPrefix,
		Enabled:       enabled,
		ScheduleCron:  body.ScheduleCron,
		ScheduleTZ:    body.ScheduleTZ,
	}

	created, err := h.svc.Create(r.Context(), wsID, routine)
	if err != nil {
		httputil.WriteError(w, http.StatusBadRequest, err.Error())
		return
	}

	resp := map[string]interface{}{
		"routine": created,
	}

	if body.GenerateToken {
		token, err := h.svc.GenerateFireToken(r.Context(), wsID, created.ID)
		if err != nil {
			httputil.WriteError(w, http.StatusInternalServerError, "routine created but token generation failed: "+err.Error())
			return
		}
		resp["fire_token"] = token
	}

	httputil.WriteJSON(w, http.StatusCreated, resp)
}

func (h *RoutinesHandler) Get(w http.ResponseWriter, r *http.Request) {
	wsID := httputil.WorkspaceFromContext(r.Context())
	id := r.PathValue("id")
	routine, err := h.svc.Get(r.Context(), wsID, id)
	if err != nil {
		httputil.WriteError(w, http.StatusNotFound, err.Error())
		return
	}
	httputil.WriteJSON(w, http.StatusOK, routine)
}

func (h *RoutinesHandler) Update(w http.ResponseWriter, r *http.Request) {
	wsID := httputil.WorkspaceFromContext(r.Context())
	id := r.PathValue("id")

	var body struct {
		Name          *string `json:"name,omitempty"`
		Prompt        *string `json:"prompt,omitempty"`
		SessionPrefix *string `json:"session_prefix,omitempty"`
		Enabled       *bool   `json:"enabled,omitempty"`
		ScheduleCron  *string `json:"schedule_cron,omitempty"`
		ScheduleTZ    *string `json:"schedule_tz,omitempty"`
		GenerateToken bool    `json:"generate_token"`
	}
	if err := httputil.ReadJSON(r, &body); err != nil {
		httputil.WriteError(w, http.StatusBadRequest, "invalid JSON body")
		return
	}

	existing, err := h.svc.Get(r.Context(), wsID, id)
	if err != nil {
		httputil.WriteError(w, http.StatusNotFound, err.Error())
		return
	}

	// Partial update: overlay only provided fields onto the existing routine.
	routine := *existing
	if body.Name != nil {
		routine.Name = *body.Name
	}
	if body.Prompt != nil {
		routine.Prompt = *body.Prompt
	}
	if body.SessionPrefix != nil {
		routine.SessionPrefix = *body.SessionPrefix
	}
	if body.Enabled != nil {
		routine.Enabled = *body.Enabled
	}
	if body.ScheduleCron != nil {
		routine.ScheduleCron = body.ScheduleCron
	}
	if body.ScheduleTZ != nil {
		routine.ScheduleTZ = *body.ScheduleTZ
	}

	updated, err := h.svc.Update(r.Context(), wsID, &routine)
	if err != nil {
		httputil.WriteError(w, http.StatusBadRequest, err.Error())
		return
	}

	resp := map[string]interface{}{
		"routine": updated,
	}

	if body.GenerateToken {
		token, err := h.svc.RotateFireToken(r.Context(), wsID, id)
		if err != nil {
			httputil.WriteError(w, http.StatusInternalServerError, "routine updated but token rotation failed: "+err.Error())
			return
		}
		resp["fire_token"] = token
	}

	httputil.WriteJSON(w, http.StatusOK, resp)
}

func (h *RoutinesHandler) Delete(w http.ResponseWriter, r *http.Request) {
	wsID := httputil.WorkspaceFromContext(r.Context())
	id := r.PathValue("id")
	if err := h.svc.Delete(r.Context(), wsID, id); err != nil {
		httputil.WriteError(w, http.StatusInternalServerError, err.Error())
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func (h *RoutinesHandler) ListRuns(w http.ResponseWriter, r *http.Request) {
	wsID := httputil.WorkspaceFromContext(r.Context())
	id := r.PathValue("id")

	limit := 100
	if l := r.URL.Query().Get("limit"); l != "" {
		if n, err := strconv.Atoi(l); err == nil && n > 0 {
			limit = n
		}
	}

	runs, err := h.svc.ListRuns(r.Context(), wsID, id, limit)
	if err != nil {
		httputil.WriteError(w, http.StatusInternalServerError, "failed to list runs: "+err.Error())
		return
	}
	if runs == nil {
		runs = []store.RoutineRun{}
	}
	httputil.WriteJSON(w, http.StatusOK, runs)
}

func (h *RoutinesHandler) Fire(w http.ResponseWriter, r *http.Request) {
	wsID := httputil.WorkspaceFromContext(r.Context())
	id := r.PathValue("id")
	ctx := r.Context()

	triggerType := "api"

	fireToken := r.Header.Get("X-Fire-Token")
	if fireToken != "" {
		// External caller using per-routine fire token
		if err := h.svc.VerifyFireToken(ctx, wsID, id, fireToken); err != nil {
			httputil.WriteError(w, http.StatusUnauthorized, err.Error())
			return
		}
		triggerType = "api"
	} else {
		// In-app caller using JWT — check RBAC
		claims := httputil.ClaimsFromContext(ctx)
		if claims == nil {
			httputil.WriteError(w, http.StatusUnauthorized, "auth required")
			return
		}
		perms := httputil.PermissionsFromContext(ctx)
		if perms != nil {
			if !hasPermission(perms, "tab:routines:run") {
				httputil.WriteError(w, http.StatusForbidden, "forbidden")
				return
			}
		}
		triggerType = "manual"
	}

	var body struct {
		Text string `json:"text"`
	}
	httputil.ReadJSON(r, &body) // optional, ignore errors

	workflowID, runID, err := h.svc.Fire(ctx, wsID, id, body.Text, triggerType)
	if err != nil {
		if strings.Contains(err.Error(), "unavailable") {
			httputil.WriteError(w, http.StatusServiceUnavailable, err.Error())
		} else {
			httputil.WriteError(w, http.StatusInternalServerError, err.Error())
		}
		return
	}

	httputil.WriteJSON(w, http.StatusAccepted, map[string]string{
		"workflow_id": workflowID,
		"run_id":      runID,
	})
}

func (h *RoutinesHandler) RotateToken(w http.ResponseWriter, r *http.Request) {
	wsID := httputil.WorkspaceFromContext(r.Context())
	id := r.PathValue("id")

	token, err := h.svc.RotateFireToken(r.Context(), wsID, id)
	if err != nil {
		httputil.WriteError(w, http.StatusInternalServerError, err.Error())
		return
	}
	httputil.WriteJSON(w, http.StatusOK, map[string]string{
		"fire_token": token,
	})
}

func (h *RoutinesHandler) RevokeToken(w http.ResponseWriter, r *http.Request) {
	wsID := httputil.WorkspaceFromContext(r.Context())
	id := r.PathValue("id")
	if err := h.svc.RevokeFireToken(r.Context(), wsID, id); err != nil {
		httputil.WriteError(w, http.StatusInternalServerError, err.Error())
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func hasPermission(perms []string, perm string) bool {
	for _, p := range perms {
		if p == perm {
			return true
		}
	}
	return false
}
