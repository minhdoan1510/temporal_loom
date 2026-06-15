package middleware

import (
	"bytes"
	"encoding/json"
	"io"
	"log/slog"
	"net/http"
	"strings"
	"time"
)

// maxCapturedBody caps how much of the request/response body we keep in memory
// for the log entry. Anything beyond is dropped to avoid blowing up logs on
// large payloads.
const maxCapturedBody = 64 * 1024

// LoggingMiddleware logs every incoming HTTP request as a pair of structured
// JSON entries — "received" with the request body, then "completed" with the
// response body, latency and HTTP status.
//
// SSE responses (Content-Type: text/event-stream) are special-cased: the
// request body is logged as usual, but the response body is NOT captured —
// only success/fail (status code + latency) is logged. This avoids buffering
// long-lived event streams in memory.
//
// /health and SPA static asset requests (anything outside /api/) are skipped
// to keep liveness probes and FE asset fetches from spamming logs.
func LoggingMiddleware() func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			if r.URL.Path == "/health" || !strings.HasPrefix(r.URL.Path, "/api/") {
				next.ServeHTTP(w, r)
				return
			}

			// Capture request body (only for methods that carry one) and
			// preserve it for the downstream handler.
			var reqBody []byte
			if r.Body != nil && shouldCaptureRequest(r.Method) {
				data, err := io.ReadAll(io.LimitReader(r.Body, maxCapturedBody+1))
				if err == nil {
					reqBody = data
					if len(reqBody) > maxCapturedBody {
						rest, _ := io.ReadAll(r.Body)
						reqBody = append(reqBody, rest...)
					}
					r.Body = io.NopCloser(bytes.NewReader(reqBody))
				}
			}

			ctx := r.Context()
			slog.InfoContext(ctx, "http.request received",
				slog.String("method", r.Method),
				slog.String("path", r.URL.Path),
				slog.String("query", r.URL.RawQuery),
				slog.Any("request", asJSONLog(reqBody)),
			)

			rec := &loggingResponseRecorder{ResponseWriter: w, status: http.StatusOK}
			start := time.Now()
			next.ServeHTTP(rec, r)
			latency := time.Since(start)

			if rec.sse {
				outcome := "success"
				if rec.status >= 400 {
					outcome = "fail"
				}
				slog.InfoContext(ctx, "http.request completed (sse)",
					slog.String("method", r.Method),
					slog.String("path", r.URL.Path),
					slog.Int("status", rec.status),
					slog.String("outcome", outcome),
					slog.String("latency", latency.String()),
				)
				return
			}

			slog.InfoContext(ctx, "http.request completed",
				slog.String("method", r.Method),
				slog.String("path", r.URL.Path),
				slog.Int("status", rec.status),
				slog.String("latency", latency.String()),
				slog.Any("response", asJSONLog(rec.buf.Bytes())),
			)
		})
	}
}

func shouldCaptureRequest(method string) bool {
	switch method {
	case http.MethodPost, http.MethodPut, http.MethodPatch, http.MethodDelete:
		return true
	}
	return false
}

// loggingResponseRecorder captures status, response body (unless SSE), and
// detects SSE responses by inspecting Content-Type at the moment the handler
// writes headers.
type loggingResponseRecorder struct {
	http.ResponseWriter
	status      int
	wroteHeader bool
	sse         bool
	buf         bytes.Buffer
}

func (r *loggingResponseRecorder) WriteHeader(code int) {
	if !r.wroteHeader {
		r.status = code
		r.wroteHeader = true
		if strings.HasPrefix(r.ResponseWriter.Header().Get("Content-Type"), "text/event-stream") {
			r.sse = true
		}
	}
	r.ResponseWriter.WriteHeader(code)
}

func (r *loggingResponseRecorder) Write(b []byte) (int, error) {
	if !r.wroteHeader {
		r.status = http.StatusOK
		r.wroteHeader = true
		if strings.HasPrefix(r.ResponseWriter.Header().Get("Content-Type"), "text/event-stream") {
			r.sse = true
		}
	}
	if !r.sse {
		if remaining := maxCapturedBody - r.buf.Len(); remaining > 0 {
			if remaining >= len(b) {
				r.buf.Write(b)
			} else {
				r.buf.Write(b[:remaining])
			}
		}
	}
	return r.ResponseWriter.Write(b)
}

// Flush keeps SSE streaming working end-to-end.
func (r *loggingResponseRecorder) Flush() {
	if f, ok := r.ResponseWriter.(http.Flusher); ok {
		f.Flush()
	}
}

// asJSONLog formats b for inclusion in a structured log field. Returns the
// nested JSON value when b is valid JSON, a plain string otherwise. Returns
// nil for empty bodies to avoid noisy "" fields.
func asJSONLog(b []byte) any {
	b = bytes.TrimSpace(b)
	if len(b) == 0 {
		return nil
	}
	if len(b) > maxCapturedBody {
		return map[string]any{
			"truncated": true,
			"size":      len(b),
			"preview":   string(b[:maxCapturedBody]),
		}
	}
	var probe any
	if json.Unmarshal(b, &probe) == nil {
		return json.RawMessage(b)
	}
	return string(b)
}
