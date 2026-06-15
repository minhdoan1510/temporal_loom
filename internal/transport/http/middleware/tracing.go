package middleware

import (
	"net/http"

	"go.opentelemetry.io/otel"
	"go.opentelemetry.io/otel/attribute"
	"go.opentelemetry.io/otel/propagation"
	"go.opentelemetry.io/otel/trace"
)

// TracingMiddleware starts an OTel server span for every HTTP request.
// It extracts any upstream W3C trace context from request headers, starts a
// child span, and injects the resulting context into the request so that
// downstream handlers (and slog.XContext calls) automatically carry trace IDs.
func TracingMiddleware(tracer trace.Tracer) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			// Extract upstream trace context (W3C TraceContext + Baggage headers).
			ctx := otel.GetTextMapPropagator().Extract(r.Context(), propagation.HeaderCarrier(r.Header))

			spanName := r.Method + " " + r.URL.Path
			ctx, span := tracer.Start(ctx, spanName,
				trace.WithSpanKind(trace.SpanKindServer),
				trace.WithAttributes(
					attribute.String("http.method", r.Method),
					attribute.String("http.url", r.URL.String()),
					attribute.String("http.route", r.URL.Path),
				),
			)
			defer span.End()

			next.ServeHTTP(w, r.WithContext(ctx))
		})
	}
}
