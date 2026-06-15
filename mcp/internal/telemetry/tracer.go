// Package telemetry sets up the OpenTelemetry SDK for the MCP server.
// It mirrors the main app's pkg/telemetry so trace context propagates
// end-to-end (B3 multi-header + Baggage) between processes.
package telemetry

import (
	"context"
	"fmt"

	"go.opentelemetry.io/contrib/propagators/b3"
	"go.opentelemetry.io/otel"
	"go.opentelemetry.io/otel/attribute"
	"go.opentelemetry.io/otel/exporters/otlp/otlptrace/otlptracegrpc"
	"go.opentelemetry.io/otel/propagation"
	"go.opentelemetry.io/otel/sdk/resource"
	sdktrace "go.opentelemetry.io/otel/sdk/trace"
	"go.opentelemetry.io/otel/trace"
	"google.golang.org/grpc"
	"google.golang.org/grpc/credentials/insecure"
)

// Setup installs the global TracerProvider + TextMapPropagator. If
// otlpEndpoint is empty, a noop provider is used (spans are still created
// in-memory so logs get trace IDs, but nothing is exported).
//
// Propagator stack matches the main app: B3 multi-header (so the agent
// process and the MCP process share trace context) + Baggage.
//
// The returned func must be called on shutdown.
func Setup(ctx context.Context, serviceName, otlpEndpoint string) (func(context.Context) error, error) {
	otel.SetTextMapPropagator(propagation.NewCompositeTextMapPropagator(
		b3.New(b3.WithInjectEncoding(b3.B3MultipleHeader)),
		propagation.Baggage{},
	))

	res, err := resource.New(ctx,
		resource.WithAttributes(attribute.String("service.name", serviceName)),
	)
	if err != nil {
		return nil, fmt.Errorf("create OTel resource: %w", err)
	}

	// Always use the SDK provider so spans get real trace/span IDs (logs
	// always carry trace.id). The exporter is only attached when an OTLP
	// endpoint is configured; without it, spans are dropped at end-of-span
	// but their IDs still appear in logs.
	tpOpts := []sdktrace.TracerProviderOption{sdktrace.WithResource(res)}

	var conn *grpc.ClientConn
	if otlpEndpoint != "" {
		conn, err = grpc.NewClient(otlpEndpoint,
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
		tpOpts = append(tpOpts, sdktrace.WithBatcher(exp))
	}

	tp := sdktrace.NewTracerProvider(tpOpts...)
	otel.SetTracerProvider(tp)

	return func(ctx context.Context) error {
		err := tp.Shutdown(ctx)
		if conn != nil {
			conn.Close()
		}
		return err
	}, nil
}

// Tracer returns a named Tracer from the global provider.
func Tracer(name string) trace.Tracer {
	return otel.Tracer(name)
}
