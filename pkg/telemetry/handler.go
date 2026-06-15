package telemetry

import (
	"context"
	"log/slog"

	"go.opentelemetry.io/otel/trace"
)

type subKey struct{}

// ContextWithSub returns a copy of ctx carrying the user subject (JWT sub).
func ContextWithSub(ctx context.Context, sub string) context.Context {
	return context.WithValue(ctx, subKey{}, sub)
}

// SubFromContext returns the user subject stored in ctx, or "".
func SubFromContext(ctx context.Context) string {
	s, _ := ctx.Value(subKey{}).(string)
	return s
}

// OTelHandler wraps a slog.Handler and injects trace_id / span_id / user.sub
// from the context into every log record.
type OTelHandler struct {
	inner slog.Handler
}

// NewOTelHandler creates a new OTelHandler wrapping inner.
func NewOTelHandler(inner slog.Handler) *OTelHandler {
	return &OTelHandler{inner: inner}
}

func (h *OTelHandler) Enabled(ctx context.Context, level slog.Level) bool {
	return h.inner.Enabled(ctx, level)
}

// Handle injects trace_id, span_id and user.sub from context into every log record.
func (h *OTelHandler) Handle(ctx context.Context, r slog.Record) error {
	span := trace.SpanFromContext(ctx)
	if span.IsRecording() {
		sc := span.SpanContext()
		r.AddAttrs(
			slog.String("trace.id", sc.TraceID().String()),
			slog.String("span.id", sc.SpanID().String()),
		)
	}
	if sub := SubFromContext(ctx); sub != "" {
		r.AddAttrs(slog.String("user.sub", sub))
	}
	return h.inner.Handle(ctx, r)
}

func (h *OTelHandler) WithAttrs(attrs []slog.Attr) slog.Handler {
	return &OTelHandler{inner: h.inner.WithAttrs(attrs)}
}

func (h *OTelHandler) WithGroup(name string) slog.Handler {
	return &OTelHandler{inner: h.inner.WithGroup(name)}
}
