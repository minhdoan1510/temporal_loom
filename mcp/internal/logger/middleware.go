package logger

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"log/slog"
	"net/http"
	"time"

	"go.opentelemetry.io/otel"
	"go.opentelemetry.io/otel/attribute"
	"go.opentelemetry.io/otel/codes"
	"go.opentelemetry.io/otel/propagation"
	"go.opentelemetry.io/otel/trace"
)

// maxCaptured caps how much of the request/response body we keep in memory
// for the log entry. Anything beyond is dropped to avoid blowing up logs on
// large payloads (e.g. SSE streams).
const maxCaptured = 64 * 1024

// Middleware logs every incoming HTTP request as a pair of structured JSON
// entries — "received" with the request body, then "completed" with the
// response body, latency and HTTP code.
//
// It also opens an OTel server span per request, extracting upstream trace
// context (B3 multi-header + Baggage by default) from the headers so the
// MCP server stitches into the caller's trace. The wrapped slog handler
// then auto-injects trace.id / span.id into every record.
func Middleware(log *slog.Logger, tracer trace.Tracer) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			// Extract upstream context and start a server span.
			ctx := otel.GetTextMapPropagator().Extract(r.Context(),
				propagation.HeaderCarrier(r.Header))
			ctx, span := tracer.Start(ctx, r.Method+" "+r.URL.Path,
				trace.WithSpanKind(trace.SpanKindServer),
				trace.WithAttributes(
					attribute.String("http.method", r.Method),
					attribute.String("http.route", r.URL.Path),
				),
			)
			defer span.End()
			r = r.WithContext(ctx)

			// Capture request body and preserve it for the downstream handler.
			var reqBody []byte
			if r.Body != nil && r.Method == http.MethodPost {
				data, err := io.ReadAll(io.LimitReader(r.Body, maxCaptured+1))
				if err == nil {
					reqBody = data
					if len(reqBody) > maxCaptured {
						rest, _ := io.ReadAll(r.Body)
						reqBody = append(reqBody, rest...)
					}
					r.Body = io.NopCloser(bytes.NewReader(reqBody))
				}
			}

			method := jsonRPCMethod(reqBody)
			if method != "" {
				span.SetAttributes(attribute.String("rpc.method", method))
			}

			log.InfoContext(ctx,
				fmt.Sprintf("[MCP Server] received request method=%s", method),
				slog.Any("request", asJSON(reqBody)),
			)

			rec := &responseRecorder{ResponseWriter: w, status: http.StatusOK}
			start := time.Now()
			next.ServeHTTP(rec, r)
			latency := time.Since(start)

			span.SetAttributes(attribute.Int("http.status_code", rec.status))
			if rec.status >= 500 {
				span.SetStatus(codes.Error, http.StatusText(rec.status))
			}

			log.InfoContext(ctx,
				fmt.Sprintf("[MCP Server] completed request method=%s", method),
				slog.Any("response", asJSON(rec.buf.Bytes())),
				slog.String("latency", latency.String()),
				slog.Int("code", rec.status),
			)
		})
	}
}

// responseRecorder captures the response status code and (up to maxCaptured
// bytes of) the response body without changing what the client sees.
type responseRecorder struct {
	http.ResponseWriter
	status      int
	wroteHeader bool
	buf         bytes.Buffer
}

func (r *responseRecorder) WriteHeader(code int) {
	if !r.wroteHeader {
		r.status = code
		r.wroteHeader = true
	}
	r.ResponseWriter.WriteHeader(code)
}

func (r *responseRecorder) Write(b []byte) (int, error) {
	if !r.wroteHeader {
		r.status = http.StatusOK
		r.wroteHeader = true
	}
	if remaining := maxCaptured - r.buf.Len(); remaining > 0 {
		if remaining >= len(b) {
			r.buf.Write(b)
		} else {
			r.buf.Write(b[:remaining])
		}
	}
	return r.ResponseWriter.Write(b)
}

// Flush keeps SSE streaming working end-to-end.
func (r *responseRecorder) Flush() {
	if f, ok := r.ResponseWriter.(http.Flusher); ok {
		f.Flush()
	}
}

func jsonRPCMethod(body []byte) string {
	if len(body) == 0 {
		return ""
	}
	var probe struct {
		Method string `json:"method"`
	}
	_ = json.Unmarshal(body, &probe)
	return probe.Method
}

// asJSON formats b for inclusion in a structured log field. Returns the
// nested JSON value when b is valid JSON, a plain string otherwise.
func asJSON(b []byte) any {
	b = bytes.TrimSpace(b)
	if len(b) == 0 {
		return nil
	}
	if len(b) > maxCaptured {
		return map[string]any{
			"truncated": true,
			"size":      len(b),
			"preview":   string(b[:maxCaptured]),
		}
	}
	var probe any
	if json.Unmarshal(b, &probe) == nil {
		return json.RawMessage(b)
	}
	return string(b)
}
