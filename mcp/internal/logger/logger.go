// Package logger provides the structured JSON slog logger used by the MCP
// server. Output schema:
//
//	{"level":"info","ts":"...","msg":"...","caller":"pkg/file.go:42",
//	 "trace.id":"...","span.id":"...", ...custom fields...}
//
// trace.id and span.id come from the active OTel span (extracted from the
// upstream caller via TextMapPropagator and started by the HTTP middleware),
// so traces propagate end-to-end with the agent process.
package logger

import (
	"io"
	"log/slog"
	"strconv"
	"strings"
	"time"

	"gitlab.zalopay.vn/fin/lending/lending-claw-mcp/internal/telemetry"
)

// New builds the configured slog.Logger. It writes JSON to out at the given
// level, formats timestamps in RFC3339, renames source → caller (file:line),
// and wraps the handler with telemetry.OTelHandler so every record carries
// trace.id / span.id from the active OTel span.
func New(out io.Writer, level slog.Level) *slog.Logger {
	base := slog.NewJSONHandler(out, &slog.HandlerOptions{
		Level:     level,
		AddSource: true,
		ReplaceAttr: func(_ []string, a slog.Attr) slog.Attr {
			switch a.Key {
			case slog.TimeKey:
				return slog.String("ts", a.Value.Time().Format(time.RFC3339))
			case slog.LevelKey:
				return slog.String("level", strings.ToLower(a.Value.String()))
			case slog.SourceKey:
				if src, ok := a.Value.Any().(*slog.Source); ok && src != nil {
					return slog.String("caller", shortCaller(src.File, src.Line))
				}
				return a
			}
			return a
		},
	})
	return slog.New(telemetry.NewOTelHandler(base))
}

// SetDefault installs the logger as the slog default.
func SetDefault(l *slog.Logger) {
	slog.SetDefault(l)
}

// shortCaller turns "/abs/path/.../pkg/file.go" into "pkg/file.go:line".
func shortCaller(file string, line int) string {
	idx := strings.LastIndexByte(file, '/')
	if idx < 0 {
		return file + ":" + strconv.Itoa(line)
	}
	prev := strings.LastIndexByte(file[:idx], '/')
	if prev < 0 {
		return file + ":" + strconv.Itoa(line)
	}
	return file[prev+1:] + ":" + strconv.Itoa(line)
}
