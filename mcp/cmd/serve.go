package cmd

import (
	"context"
	"flag"
	"fmt"
	"log/slog"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/modelcontextprotocol/go-sdk/mcp"

	"gitlab.zalopay.vn/fin/lending/lending-claw-mcp/internal/config"
	"gitlab.zalopay.vn/fin/lending/lending-claw-mcp/internal/logger"
	jiraserver "gitlab.zalopay.vn/fin/lending/lending-claw-mcp/internal/servers/jira"
	loanserver "gitlab.zalopay.vn/fin/lending/lending-claw-mcp/internal/servers/loan"
	opensearchserver "gitlab.zalopay.vn/fin/lending/lending-claw-mcp/internal/servers/opensearch"
	"gitlab.zalopay.vn/fin/lending/lending-claw-mcp/internal/telemetry"
)

func Execute() {
	var cfgPath string
	flag.StringVar(&cfgPath, "config", "config.yaml", "path to config file")
	flag.Parse()

	log := logger.New(os.Stdout, slog.LevelInfo)
	logger.SetDefault(log)

	cfg, err := config.Load(cfgPath)
	if err != nil {
		slog.Error("load config", "error", err)
		os.Exit(1)
	}

	// OTel setup. Empty otlp_endpoint → noop provider (no exporter), but the
	// global propagator is still configured so trace context still propagates
	// in-process from middleware into logs.
	svcName := cfg.Telemetry.ServiceName
	if svcName == "" {
		svcName = "lending-claw-mcp"
	}
	shutdownTel, err := telemetry.Setup(context.Background(), svcName, cfg.Telemetry.OTLPEndpoint)
	if err != nil {
		slog.Error("telemetry setup", "error", err)
		os.Exit(1)
	}
	defer func() {
		ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancel()
		_ = shutdownTel(ctx)
	}()
	tracer := telemetry.Tracer("lending-claw-mcp/http")

	mux := http.NewServeMux()

	mountMCP(mux, "/mcp/jira", jiraserver.New(cfg.Jira))
	mountMCP(mux, "/mcp/opensearch", opensearchserver.New(cfg.OpenSearch))

	loanSrv, loanCleanup, err := loanserver.New(cfg.Onboarding)
	if err != nil {
		slog.Warn("loan mcp server init failed; endpoint will not be mounted", "error", err)
	} else {
		mountMCP(mux, "/mcp/loan", loanSrv)
		defer loanCleanup()
	}

	mux.HandleFunc("GET /health", func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write([]byte("ok"))
	})

	// Order (outermost → innermost): logging+tracing → auth → mux.
	// Logging runs first so unauthorized requests are still traced/captured.
	handler := logger.Middleware(log, tracer)(authMiddleware(cfg.MCPServer.AuthToken, mux))

	addr := fmt.Sprintf("%s:%d", cfg.MCPServer.Host, cfg.MCPServer.Port)
	httpSrv := &http.Server{
		Addr:              addr,
		Handler:           handler,
		ReadHeaderTimeout: 10 * time.Second,
	}

	go func() {
		slog.Info("mcp server listening", "addr", addr)
		if err := httpSrv.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			slog.Error("listen", "error", err)
			os.Exit(1)
		}
	}()

	stop := make(chan os.Signal, 1)
	signal.Notify(stop, os.Interrupt, syscall.SIGTERM)
	<-stop

	slog.Info("shutting down")
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	_ = httpSrv.Shutdown(ctx)
}

func mountMCP(mux *http.ServeMux, path string, srv *mcp.Server) {
	if srv == nil {
		slog.Warn("skip mount: nil server", "path", path)
		return
	}
	handler := mcp.NewStreamableHTTPHandler(
		func(*http.Request) *mcp.Server { return srv },
		&mcp.StreamableHTTPOptions{Stateless: true},
	)
	mux.Handle(path, handler)
	slog.Info("mounted mcp endpoint", "path", path)
}

func authMiddleware(token string, next http.Handler) http.Handler {
	if token == "" {
		return next
	}
	expected := "Bearer " + token
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path == "/health" {
			next.ServeHTTP(w, r)
			return
		}
		if r.Header.Get("Authorization") != expected {
			http.Error(w, "unauthorized", http.StatusUnauthorized)
			return
		}
		next.ServeHTTP(w, r)
	})
}
