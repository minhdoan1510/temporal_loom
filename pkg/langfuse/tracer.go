// Package langfuse provides small OpenTelemetry span helpers annotated with
// both the OTel GenAI semantic conventions and Langfuse's langfuse.* attribute
// namespace, so traces render correctly in Langfuse (generations with token
// usage, tool spans, trace-level session/user metadata).
//
// It is a leaf package: it imports only OTel + stdlib, never internal/*, so any
// layer (agent loop, providers, tools) can instrument itself by calling these
// helpers directly without import cycles.
//
// It is noop-safe: when no exporter is configured the global OTel provider is a
// no-op, so spans are cheap and discarded. Exporter wiring lives in
// pkg/telemetry (Setup); this package only builds the spans.
package langfuse

import (
	"context"
	"encoding/json"

	"go.opentelemetry.io/otel"
	"go.opentelemetry.io/otel/attribute"
	"go.opentelemetry.io/otel/codes"
	"go.opentelemetry.io/otel/trace"
)

// maxAttrChars caps input/output payloads attached to spans so a single large
// message doesn't bloat the exported trace.
const maxAttrChars = 50000

// TracerName is the OTel instrumentation scope used by all agent spans (run,
// generation, tool). Exporters can filter on this scope to keep only
// agent-related spans (e.g. exclude HTTP server spans).
const TracerName = "lending-claw/agent"

func tracer() trace.Tracer { return otel.Tracer(TracerName) }

// ---- Run (root trace) -------------------------------------------------------

// RunInfo describes an agent run for the root span.
type RunInfo struct {
	Name        string
	SessionID   string
	UserID      string
	Input       string
	WorkspaceID string
	Channel     string
	RunID       string
}

// RunSpan is the handle for a run span. Call End or Fail exactly once.
type RunSpan struct{ span trace.Span }

// StartRun opens the root span for an agent run. Trace-level attributes use the
// langfuse.* namespace so Langfuse maps session/user/metadata onto the trace.
//
// Langfuse reads trace-level fields (userId, sessionId, name) from the trace's
// root span. When the run is invoked under an HTTP server span that span is the
// root, so the same attributes are propagated onto it as well.
func StartRun(ctx context.Context, info RunInfo) (context.Context, RunSpan) {
	name := info.Name
	if name == "" {
		name = "agent"
	}
	attrs := []attribute.KeyValue{
		attribute.String("langfuse.trace.name", name),
		attribute.String("langfuse.session.id", info.SessionID),
		attribute.String("langfuse.user.id", info.UserID),
		attribute.String("langfuse.trace.input", truncate(info.Input)),
		attribute.String("langfuse.trace.metadata.workspace_id", info.WorkspaceID),
		attribute.String("langfuse.trace.metadata.channel", info.Channel),
		attribute.String("langfuse.trace.metadata.run_id", info.RunID),
	}
	// Propagate to the current (parent/root) span; no-op when there is none.
	trace.SpanFromContext(ctx).SetAttributes(attrs...)

	ctx, span := tracer().Start(ctx, "agent.run", trace.WithSpanKind(trace.SpanKindInternal))
	span.SetAttributes(attrs...)
	return ctx, RunSpan{span}
}

func (s RunSpan) End(output string, inputTokens, outputTokens, iterations int) {
	setOutput(s.span, "langfuse.trace.output", output)
	s.span.SetAttributes(
		attribute.Int("agent.iterations", iterations),
		attribute.Int("gen_ai.usage.input_tokens", inputTokens),
		attribute.Int("gen_ai.usage.output_tokens", outputTokens),
	)
	s.span.End()
}

func (s RunSpan) Fail(err error) {
	if err != nil {
		s.span.RecordError(err)
		s.span.SetStatus(codes.Error, err.Error())
	}
	s.span.End()
}

// ---- Generation (one LLM call) ----------------------------------------------

// GenInfo describes a single LLM call for the generation observation.
type GenInfo struct {
	Provider    string
	Model       string
	Input       any // marshaled to JSON for langfuse.observation.input
	Temperature float64
	TopP        float64
	MaxTokens   int
}

// GenSpan is the handle for a generation span. Call End or Fail exactly once.
type GenSpan struct{ span trace.Span }

// StartGeneration opens a generation observation for one LLM call.
func StartGeneration(ctx context.Context, info GenInfo) (context.Context, GenSpan) {
	ctx, span := tracer().Start(ctx, "chat "+info.Model, trace.WithSpanKind(trace.SpanKindClient))
	span.SetAttributes(
		attribute.String("langfuse.observation.type", "generation"),
		attribute.String("gen_ai.system", info.Provider),
		attribute.String("gen_ai.operation.name", "chat"),
		attribute.String("gen_ai.request.model", info.Model),
		attribute.Float64("gen_ai.request.temperature", info.Temperature),
		attribute.Float64("gen_ai.request.top_p", info.TopP),
		attribute.Int("gen_ai.request.max_tokens", info.MaxTokens),
	)
	if info.Input != nil {
		if b, err := json.Marshal(info.Input); err == nil {
			span.SetAttributes(attribute.String("langfuse.observation.input", truncate(string(b))))
		}
	}
	return ctx, GenSpan{span}
}

// End closes the generation. output is the provider response (or any value); it
// is JSON-encoded so tool-call turns (empty text) still produce valid output.
func (s GenSpan) End(output any, finishReason string, inputTokens, outputTokens int) {
	setOutput(s.span, "langfuse.observation.output", output)
	s.span.SetAttributes(
		attribute.Int("gen_ai.usage.input_tokens", inputTokens),
		attribute.Int("gen_ai.usage.output_tokens", outputTokens),
	)
	if finishReason != "" {
		s.span.SetAttributes(attribute.String("gen_ai.response.finish_reasons", finishReason))
	}
	s.span.End()
}

func (s GenSpan) Fail(err error) {
	if err != nil {
		s.span.RecordError(err)
		s.span.SetStatus(codes.Error, err.Error())
	}
	s.span.End()
}

// ---- Tool -------------------------------------------------------------------

// ToolSpan is the handle for a tool span. Call End exactly once.
type ToolSpan struct{ span trace.Span }

// StartTool opens a span observation around a tool execution.
func StartTool(ctx context.Context, name string, args any) (context.Context, ToolSpan) {
	ctx, span := tracer().Start(ctx, "tool "+name, trace.WithSpanKind(trace.SpanKindInternal))
	span.SetAttributes(
		attribute.String("langfuse.observation.type", "span"),
		attribute.String("tool.name", name),
	)
	if args != nil {
		if b, err := json.Marshal(args); err == nil {
			span.SetAttributes(attribute.String("langfuse.observation.input", truncate(string(b))))
		}
	}
	return ctx, ToolSpan{span}
}

func (s ToolSpan) End(output string, isError bool) {
	s.span.SetAttributes(attribute.Bool("tool.is_error", isError))
	setOutput(s.span, "langfuse.observation.output", output)
	if isError {
		s.span.SetStatus(codes.Error, output)
	}
	s.span.End()
}

// setOutput sets the given output attribute from v. Strings are used verbatim,
// other values are JSON-encoded. Empty/nil output is skipped, since Langfuse
// renders an empty string as "undefined".
func setOutput(span trace.Span, key string, v any) {
	switch val := v.(type) {
	case nil:
		return
	case string:
		if val == "" {
			return
		}
		span.SetAttributes(attribute.String(key, truncate(val)))
	default:
		b, err := json.Marshal(v)
		if err != nil || len(b) == 0 || string(b) == "null" {
			return
		}
		span.SetAttributes(attribute.String(key, truncate(string(b))))
	}
}

// truncate shortens s for use as a span attribute value.
func truncate(s string) string {
	if len(s) <= maxAttrChars {
		return s
	}
	return s[:maxAttrChars] + "…[truncated]"
}
