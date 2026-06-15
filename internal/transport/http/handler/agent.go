package handler

import (
	"encoding/json"
	"fmt"
	"log/slog"
	"net/http"

	"github.com/google/uuid"
	"gitlab.zalopay.vn/fin/lending/lending-claw/internal/agent"
	"gitlab.zalopay.vn/fin/lending/lending-claw/pkg/httputil"
)

// AgentHandler handles POST /api/v1/agent/run.
type AgentHandler struct {
	loop *agent.Loop
}

// NewAgentHandler creates an AgentHandler.
func NewAgentHandler(loop *agent.Loop) *AgentHandler {
	return &AgentHandler{loop: loop}
}

type runRequest struct {
	SessionKey string `json:"session_key"`
	Message    string `json:"message"`
	Channel    string `json:"channel"`
	Stream     bool   `json:"stream"`
}

// Run executes the agent loop for a single message.
// If stream=true, the response is SSE; otherwise JSON.
func (h *AgentHandler) Run(w http.ResponseWriter, r *http.Request) {
	var body runRequest
	if err := httputil.ReadJSON(r, &body); err != nil {
		httputil.WriteError(w, http.StatusBadRequest, "invalid JSON body")
		return
	}

	if body.SessionKey == "" {
		httputil.WriteError(w, http.StatusBadRequest, "session_key is required")
		return
	}
	if body.Message == "" {
		httputil.WriteError(w, http.StatusBadRequest, "message is required")
		return
	}
	if body.Channel == "" {
		body.Channel = "http"
	}

	// The user identity is always the authenticated JWT subject — never taken
	// from the request body, so callers cannot impersonate another user. It is
	// used both as the session creator and as the run's UserID (e.g. for the
	// Langfuse trace userId).
	var userID string
	if claims := httputil.ClaimsFromContext(r.Context()); claims != nil {
		userID = claims.Sub
	}

	workspaceID := httputil.WorkspaceFromContext(r.Context())

	runID := uuid.New().String()
	h.loop.EnsureSession(workspaceID, body.SessionKey, userID)

	req := agent.RunRequest{
		WorkspaceID: workspaceID,
		SessionKey:  body.SessionKey,
		Message:     body.Message,
		Channel:     body.Channel,
		UserID:      userID,
		RunID:       runID,
		Stream:      body.Stream,
	}

	if body.Stream {
		h.runSSE(w, r, req)
	} else {
		h.runJSON(w, r, req)
	}
}

func (h *AgentHandler) runJSON(w http.ResponseWriter, r *http.Request, req agent.RunRequest) {
	ctx := r.Context()
	result, err := h.loop.Run(ctx, req)
	if err != nil {
		slog.WarnContext(ctx, "agent run failed", "run_id", req.RunID, "error", err)
		httputil.WriteError(w, http.StatusInternalServerError, "agent run failed: "+err.Error())
		return
	}
	httputil.WriteJSON(w, http.StatusOK, result)
}

func (h *AgentHandler) runSSE(w http.ResponseWriter, r *http.Request, req agent.RunRequest) {
	flusher, ok := w.(http.Flusher)
	if !ok {
		httputil.WriteError(w, http.StatusInternalServerError, "streaming not supported")
		return
	}

	w.Header().Set("Content-Type", "text/event-stream")
	w.Header().Set("Cache-Control", "no-cache")
	w.Header().Set("Connection", "keep-alive")
	w.Header().Set("X-Accel-Buffering", "no")
	w.WriteHeader(http.StatusOK)

	// Create an event channel for this run
	events := make(chan agent.AgentEvent, 64)
	done := make(chan struct{})

	// Register per-request callback
	ctx := r.Context()
	req.OnEvent = func(evt agent.AgentEvent) {
		select {
		case events <- evt:
		default:
			slog.WarnContext(ctx, "SSE event buffer full, dropping event", "type", evt.Type, "run_id", evt.RunID)
		}
	}

	// Write SSE events in a separate goroutine
	go func() {
		defer close(done)
		for evt := range events {
			data, err := json.Marshal(evt)
			if err != nil {
				continue
			}
			fmt.Fprintf(w, "event: %s\ndata: %s\n\n", evt.Type, data)
			flusher.Flush()
		}
	}()

	// Run agent (blocks until complete).
	// The loop itself emits run.completed / run.failed via req.OnEvent,
	// so we just need to wait for it and close the channel.
	_, _ = h.loop.Run(r.Context(), req)

	close(events)
	<-done
	flusher.Flush()
}
