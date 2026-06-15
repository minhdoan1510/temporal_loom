package cmd

import (
	"context"
	"fmt"
	"log/slog"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/spf13/cobra"
	lchttp "gitlab.zalopay.vn/fin/lending/lending-claw/internal/transport/http"
	"gitlab.zalopay.vn/fin/lending/lending-claw/pkg/telemetry"

	"gitlab.zalopay.vn/fin/lending/lending-claw/internal/agent"
)

func init() {
	rootCmd.AddCommand(serveCmd())
}

func serveCmd() *cobra.Command {
	cmd := &cobra.Command{
		Use:   "serve",
		Short: "Start the HTTP API server",
		Long:  "Start the lending-claw HTTP API server with SSE streaming support.",
		RunE: func(cmd *cobra.Command, args []string) error {
			return runServe()
		},
	}
	return cmd
}

func runServe() error {
	ctx := context.Background()

	deps, cleanup, err := BuildDeps(ctx)
	if err != nil {
		return err
	}
	defer cleanup()

	// Initialise OTel tracing.  When otlp_endpoint is empty a noop provider
	// is used so no network calls are made.
	svcName := deps.Config.Telemetry.ServiceName
	if svcName == "" {
		svcName = "lending-claw"
	}
	lf := deps.Config.Telemetry.Langfuse
	shutdownTracer, err := telemetry.Setup(ctx, svcName, deps.Config.Telemetry.OTLPEndpoint, telemetry.LangfuseConfig{
		Enabled:   lf.Enabled,
		Endpoint:  lf.Endpoint,
		PublicKey: lf.PublicKey,
		SecretKey: lf.SecretKey,
	})
	if err != nil {
		return fmt.Errorf("init telemetry: %w", err)
	}
	defer func() {
		shutdownCtx, cancel := context.WithTimeout(ctx, 5*time.Second)
		defer cancel()
		_ = shutdownTracer(shutdownCtx)
	}()

	// Global event handler: run lifecycle logging.
	onEvent := func(ctx context.Context, evt agent.AgentEvent) {
		switch evt.Type {
		case agent.EventRunStarted:
			slog.InfoContext(ctx, "run started", "run_id", evt.RunID)
		case agent.EventRunCompleted:
			slog.InfoContext(ctx, "run completed", "run_id", evt.RunID)
		case agent.EventRunFailed:
			slog.WarnContext(ctx, "run failed", "run_id", evt.RunID, "payload", evt.Payload)
		}
	}

	// Create agent loop
	loop := agent.NewLoop(agent.LoopConfig{
		ID:                      "lending-agent",
		Provider:                deps.Provider,
		Model:                   deps.Config.LLM.Model,
		ContextWindow:           deps.Config.Agent.ContextWindow,
		MaxIterations:           deps.Config.Agent.MaxIterations,
		MaxHistoryShare:         deps.Config.Agent.MaxHistoryShare,
		Sessions:                deps.Stores.Sessions,
		ContextFiles:            deps.Stores.ContextFiles,
		Tools:                   deps.ToolsReg,
		OnEvent:                 onEvent,
		MaxMessageChars:         deps.Config.Agent.MaxMessageChars,
		SkillsCache:             deps.SkillsCache,
		HasMemory:               deps.HasMemory,
		Memory:                  deps.MemManager,
		MemoryCaptureEveryTurns: deps.Config.Agent.MemoryCaptureEveryTurns,
		MemoryRecallMinScore:    deps.Config.Agent.MemoryRecallMinScore,
		Temperature:             deps.Config.Agent.Temperature,
		TopP:                    deps.Config.Agent.TopP,
	})

	// Create router
	handler := lchttp.NewRouter(lchttp.RouterDeps{
		Stores:         deps.Stores,
		Loop:           loop,
		JWTSecret:      deps.Config.Server.JWTSecret,
		AllowedOrigins: deps.Config.Server.AllowedOrigins,
		WebDir:         deps.Config.Server.WebDir,
		Tracer:         telemetry.Tracer("lending-claw/http"),
		Enforcer:       deps.Enforcer,
		ToolsReg:       deps.ToolsReg,
		MCPManager:     deps.MCPManager,
		Config:         deps.Config,
		SkillsCache:    deps.SkillsCache,
	})

	addr := fmt.Sprintf("%s:%d", deps.Config.Server.Host, deps.Config.Server.Port)
	srv := &http.Server{
		Addr:         addr,
		Handler:      handler,
		ReadTimeout:  30 * time.Second,
		WriteTimeout: 5 * time.Minute, // long for SSE
		IdleTimeout:  120 * time.Second,
	}

	// Graceful shutdown
	errCh := make(chan error, 1)
	go func() {
		slog.InfoContext(ctx, "HTTP server starting", "addr", addr)
		errCh <- srv.ListenAndServe()
	}()

	sigCh := make(chan os.Signal, 1)
	signal.Notify(sigCh, syscall.SIGINT, syscall.SIGTERM)

	select {
	case err := <-errCh:
		if err != nil && err != http.ErrServerClosed {
			return fmt.Errorf("server error: %w", err)
		}
	case sig := <-sigCh:
		slog.InfoContext(ctx, "shutdown signal received", "signal", sig)
		shutdownCtx, cancel := context.WithTimeout(ctx, 30*time.Second)
		defer cancel()
		if err := srv.Shutdown(shutdownCtx); err != nil {
			return fmt.Errorf("graceful shutdown failed: %w", err)
		}
		slog.InfoContext(ctx, "server shut down gracefully")
	}

	return nil
}
