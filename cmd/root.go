package cmd

import (
	"fmt"
	"log/slog"
	"os"
	"path/filepath"
	"strings"
	"time"

	"github.com/spf13/cobra"
	"gitlab.zalopay.vn/fin/lending/lending-claw/pkg/telemetry"
)

var (
	cfgFile string
	verbose bool
)

var rootCmd = &cobra.Command{
	Use:   "lending-claw",
	Short: "lending-claw — AI agent platform for Zalopay lending",
	Long:  "lending-claw: AI agent platform with extensible tools, DB-backed skills, and multi-channel support for Zalopay operations.",
}

func init() {
	rootCmd.PersistentFlags().StringVar(&cfgFile, "config", "", "config file (default: config.yaml)")
	rootCmd.PersistentFlags().BoolVarP(&verbose, "verbose", "v", false, "enable debug logging")

	cobra.OnInitialize(initLogging)

	rootCmd.AddCommand(versionCmd())
}

func initLogging() {
	level := slog.LevelInfo
	if verbose {
		level = slog.LevelDebug
	}
	opts := &slog.HandlerOptions{
		Level:     level,
		AddSource: true,
		ReplaceAttr: func(groups []string, a slog.Attr) slog.Attr {
			switch a.Key {
			case slog.TimeKey:
				if len(groups) == 0 {
					a.Key = "ts"
					if t, ok := a.Value.Any().(time.Time); ok {
						a.Value = slog.StringValue(t.Format(time.RFC3339))
					}
				}
			case slog.LevelKey:
				if lvl, ok := a.Value.Any().(slog.Level); ok {
					a.Value = slog.StringValue(strings.ToLower(lvl.String()))
				}
			case slog.SourceKey:
				if source, ok := a.Value.Any().(*slog.Source); ok {
					return slog.String("caller",
						fmt.Sprintf("%s:%d", filepath.Base(source.File), source.Line))
				}
			}
			return a
		},
	}
	var inner slog.Handler
	if verbose {
		inner = slog.NewTextHandler(os.Stderr, opts)
	} else {
		inner = slog.NewJSONHandler(os.Stderr, opts)
	}
	// Wrap with OTel handler so trace_id / span_id are injected automatically
	// whenever a context carrying an active span is passed to slog.XContext calls.
	slog.SetDefault(slog.New(telemetry.NewOTelHandler(inner)))
}

func resolveConfigPath() string {
	if cfgFile != "" {
		return cfgFile
	}
	return "/apps/config/config.yaml"
}

// Execute runs the root cobra command.
func Execute() {
	if err := rootCmd.Execute(); err != nil {
		os.Exit(1)
	}
}
