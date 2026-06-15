package telemetry

import (
	"context"
	"log/slog"

	"go.opentelemetry.io/otel/trace"
)

// OTelHandler wraps an inner slog.Handler and adds trace.id / span.id from
// the active OTel span on every record.
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

func (h *OTelHandler) Handle(ctx context.Context, r slog.Record) error {
	sc := trace.SpanFromContext(ctx).SpanContext()
	if sc.IsValid() {
		r.AddAttrs(
			slog.String("trace.id", sc.TraceID().String()),
			slog.String("span.id", sc.SpanID().String()),
		)
	}
	return h.inner.Handle(ctx, r)
}

func (h *OTelHandler) WithAttrs(attrs []slog.Attr) slog.Handler {
	return &OTelHandler{inner: h.inner.WithAttrs(attrs)}
}

func (h *OTelHandler) WithGroup(name string) slog.Handler {
	return &OTelHandler{inner: h.inner.WithGroup(name)}
}
