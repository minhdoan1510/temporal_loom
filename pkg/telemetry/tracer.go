package telemetry

import (
	"context"
	"encoding/base64"
	"fmt"

	"go.opentelemetry.io/contrib/propagators/b3"
	"go.opentelemetry.io/otel"
	"go.opentelemetry.io/otel/attribute"
	"go.opentelemetry.io/otel/exporters/otlp/otlptrace/otlptracegrpc"
	"go.opentelemetry.io/otel/exporters/otlp/otlptrace/otlptracehttp"
	"go.opentelemetry.io/otel/propagation"
	"go.opentelemetry.io/otel/sdk/resource"
	sdktrace "go.opentelemetry.io/otel/sdk/trace"
	"go.opentelemetry.io/otel/trace"
	"go.opentelemetry.io/otel/trace/noop"
	"google.golang.org/grpc"
	"google.golang.org/grpc/credentials/insecure"

	"gitlab.zalopay.vn/fin/lending/lending-claw/pkg/langfuse"
)

// LangfuseConfig configures direct OTLP/HTTP export to a Langfuse instance.
// It mirrors config.LangfuseConfig but is kept local so pkg/telemetry stays
// free of internal/* imports.
type LangfuseConfig struct {
	Enabled   bool
	Endpoint  string // full traces URL, e.g. "http://langfuse:3000/api/public/otel/v1/traces"
	PublicKey string
	SecretKey string
}

// Setup initialises the global OTel TracerProvider and TextMapPropagator.
//
//   - When otlpEndpoint is set, an OTLP/gRPC exporter is created pointing at it
//     (e.g. "otel-collector:4317"). TLS is disabled (insecure transport).
//   - When lf.Enabled is set, an OTLP/HTTP exporter is created pointing at the
//     Langfuse traces endpoint, authenticated with Basic auth derived from the
//     public/secret keys. Langfuse only supports OTLP over HTTP, not gRPC.
//   - Both exporters can be active simultaneously; each gets its own batch span
//     processor on the shared TracerProvider.
//   - If neither is configured a noop provider is used and no spans are
//     exported. This is the zero-config default.
//
// The returned function must be called on shutdown to flush and close the
// exporter(s) gracefully.
func Setup(ctx context.Context, serviceName, otlpEndpoint string, lf LangfuseConfig) (func(context.Context) error, error) {
	if otlpEndpoint == "" && !lf.Enabled {
		otel.SetTracerProvider(noop.NewTracerProvider())
		return func(context.Context) error { return nil }, nil
	}

	res, err := resource.New(ctx,
		resource.WithAttributes(
			attribute.String("service.name", serviceName),
		),
	)
	if err != nil {
		return nil, fmt.Errorf("create OTel resource: %w", err)
	}

	opts := []sdktrace.TracerProviderOption{sdktrace.WithResource(res)}

	// closers run in reverse order on shutdown.
	var closers []func(context.Context) error

	if otlpEndpoint != "" {
		conn, err := grpc.NewClient(otlpEndpoint,
			grpc.WithTransportCredentials(insecure.NewCredentials()),
		)
		if err != nil {
			return nil, fmt.Errorf("create gRPC connection for OTLP: %w", err)
		}
		exp, err := otlptracegrpc.New(ctx, otlptracegrpc.WithGRPCConn(conn))
		if err != nil {
			conn.Close()
			return nil, fmt.Errorf("create OTLP gRPC exporter: %w", err)
		}
		opts = append(opts, sdktrace.WithBatcher(exp))
		closers = append(closers, func(c context.Context) error {
			err := exp.Shutdown(c)
			conn.Close()
			return err
		})
	}

	if lf.Enabled {
		if lf.Endpoint == "" {
			return nil, fmt.Errorf("langfuse enabled but endpoint is empty")
		}
		auth := base64.StdEncoding.EncodeToString([]byte(lf.PublicKey + ":" + lf.SecretKey))
		exp, err := otlptracehttp.New(ctx,
			otlptracehttp.WithEndpointURL(lf.Endpoint),
			otlptracehttp.WithHeaders(map[string]string{
				"Authorization":                "Basic " + auth,
				"x-langfuse-ingestion-version": "4",
			}),
		)
		if err != nil {
			return nil, fmt.Errorf("create OTLP HTTP exporter for Langfuse: %w", err)
		}
		// Only export agent spans (run/generation/tool) to Langfuse; HTTP server
		// spans and other scopes still go to the gRPC collector above.
		opts = append(opts, sdktrace.WithBatcher(scopeFilterExporter{SpanExporter: exp, scope: langfuse.TracerName}))
		closers = append(closers, exp.Shutdown)
	}

	tp := sdktrace.NewTracerProvider(opts...)

	otel.SetTracerProvider(tp)
	otel.SetTextMapPropagator(propagation.NewCompositeTextMapPropagator(
		b3.New(b3.WithInjectEncoding(b3.B3MultipleHeader)),
		propagation.Baggage{},
	))

	return func(ctx context.Context) error {
		// Flush and close the provider first so all batches drain, then close
		// the underlying exporters/connections.
		err := tp.Shutdown(ctx)
		for i := len(closers) - 1; i >= 0; i-- {
			if cerr := closers[i](ctx); cerr != nil && err == nil {
				err = cerr
			}
		}
		return err
	}, nil
}

// Tracer returns a named Tracer from the global provider.
func Tracer(name string) trace.Tracer {
	return otel.Tracer(name)
}

// scopeFilterExporter wraps a SpanExporter and forwards only spans whose
// instrumentation scope matches scope. Used to send just agent spans to
// Langfuse while the collector receives everything.
type scopeFilterExporter struct {
	sdktrace.SpanExporter
	scope string
}

func (e scopeFilterExporter) ExportSpans(ctx context.Context, spans []sdktrace.ReadOnlySpan) error {
	filtered := make([]sdktrace.ReadOnlySpan, 0, len(spans))
	for _, s := range spans {
		if s.InstrumentationScope().Name == e.scope {
			filtered = append(filtered, s)
		}
	}
	if len(filtered) == 0 {
		return nil
	}
	return e.SpanExporter.ExportSpans(ctx, filtered)
}
