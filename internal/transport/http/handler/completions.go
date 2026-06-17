package handler

import (
	"encoding/json"
	"fmt"
	"net/http"

	"gitlab.zalopay.vn/fin/lending/lending-claw/internal/agent"
	completionapi "gitlab.zalopay.vn/fin/lending/lending-claw/internal/completions"
	"gitlab.zalopay.vn/fin/lending/lending-claw/pkg/httputil"
)

// CompletionsHandler exposes a small OpenAI-compatible chat completion API.
type CompletionsHandler struct {
	loop *agent.Loop
}

func NewCompletionsHandler(loop *agent.Loop) *CompletionsHandler {
	return &CompletionsHandler{loop: loop}
}

// ChatCompletions handles POST /chat/completions with OpenAI-compatible
// request/response shapes. It intentionally does not accept tools.
func (h *CompletionsHandler) ChatCompletions(w http.ResponseWriter, r *http.Request) {
	var body completionapi.ChatCompletionRequest
	if err := httputil.ReadJSON(r, &body); err != nil {
		httputil.WriteError(w, http.StatusBadRequest, "invalid JSON body")
		return
	}

	service := h.service()
	if err := service.Validate(body); err != nil {
		writeCompletionError(w, err)
		return
	}

	if body.Stream {
		h.streamChatCompletion(w, r, service, body)
		return
	}

	resp, err := service.Complete(r.Context(), body)
	if err != nil {
		writeCompletionError(w, err)
		return
	}

	httputil.WriteJSON(w, http.StatusOK, resp)
}

func (h *CompletionsHandler) streamChatCompletion(w http.ResponseWriter, r *http.Request, service *completionapi.Service, req completionapi.ChatCompletionRequest) {
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

	writeChunk := func(chunk completionapi.ChatCompletionChunk) {
		data, err := json.Marshal(chunk)
		if err != nil {
			return
		}
		fmt.Fprintf(w, "data: %s\n\n", data)
		flusher.Flush()
	}

	result, err := service.Stream(r.Context(), req, writeChunk)
	if err != nil {
		errMsg := "completion failed: " + err.Error()
		data, _ := json.Marshal(map[string]any{
			"error": map[string]string{
				"message": errMsg,
				"type":    "server_error",
			},
		})
		fmt.Fprintf(w, "data: %s\n\n", data)
		fmt.Fprint(w, "data: [DONE]\n\n")
		flusher.Flush()
		return
	}

	finish := completionapi.FinishReason(result.Response.FinishReason)
	writeChunk(completionapi.ChatCompletionChunk{
		ID:      result.ID,
		Object:  "chat.completion.chunk",
		Created: result.Created,
		Model:   result.Model,
		Choices: []completionapi.CompletionChunkChoice{{
			Index:        0,
			Delta:        completionapi.Message{},
			FinishReason: &finish,
		}},
		Usage: completionapi.UsageFrom(result.Response.Usage),
	})
	fmt.Fprint(w, "data: [DONE]\n\n")
	flusher.Flush()
}

func (h *CompletionsHandler) service() *completionapi.Service {
	if h == nil || h.loop == nil {
		return completionapi.NewService(nil, "")
	}
	return completionapi.NewService(h.loop.Provider(), h.loop.Model())
}

func writeCompletionError(w http.ResponseWriter, err error) {
	if completionapi.IsValidationError(err) {
		httputil.WriteError(w, http.StatusBadRequest, err.Error())
		return
	}
	httputil.WriteError(w, http.StatusInternalServerError, "completion failed: "+err.Error())
}
