package temporal

import (
	"crypto/tls"
	"fmt"
	"log/slog"

	"gitlab.zalopay.vn/fin/lending/lending-claw/internal/config"
	sdkclient "go.temporal.io/sdk/client"
)

// TaskQueue is the Temporal task queue used by all routine workflows and the
// worker. Defined here (not in config) so it is consistent across scheduler,
// worker, and manual triggers.
const TaskQueue = "lending-claw-routines"

type Client struct {
	sdkclient.Client
}

func Dial(cfg config.TemporalConfig) (*Client, error) {
	if cfg.HostPort == "" {
		return nil, fmt.Errorf("temporal.host_port is empty")
	}

	opts := sdkclient.Options{
		HostPort:  cfg.HostPort,
		Namespace: cfg.Namespace,
	}

	if cfg.TLS {
		opts.ConnectionOptions = sdkclient.ConnectionOptions{
			TLS: &tls.Config{},
		}
	}

	slog.Info("dialing temporal",
		"host_port", cfg.HostPort,
		"namespace", cfg.Namespace,
		"tls", cfg.TLS,
	)

	c, err := sdkclient.Dial(opts)
	if err != nil {
		return nil, fmt.Errorf("dial temporal: %w", err)
	}

	slog.Info("temporal client connected",
		"host_port", cfg.HostPort,
		"namespace", cfg.Namespace,
	)

	return &Client{Client: c}, nil
}
