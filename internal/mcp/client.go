// Package mcp connects the main app to one or more external MCP servers,
// discovers their tools, and exposes them through the existing tools.Registry.
package mcp

import (
	"context"
	"fmt"
	"net/http"
	"sync"
	"time"

	"github.com/modelcontextprotocol/go-sdk/mcp"
	"go.opentelemetry.io/otel"
	"go.opentelemetry.io/otel/propagation"
)

// Conn is a thin wrapper around a streamable-HTTP MCP client session. It is
// bound to a single MCP endpoint and re-initializes the underlying session
// transparently if the connection is lost.
type Conn struct {
	serverName    string
	url           string
	authToken     string
	tokenProvider tokenProvider

	mu          sync.Mutex
	client      *mcp.Client
	session     *mcp.ClientSession
	initialized bool
}

type tokenProvider func(context.Context) (string, error)

type ConnOption func(*Conn)

func WithTokenProvider(provider tokenProvider) ConnOption {
	return func(c *Conn) {
		c.tokenProvider = provider
	}
}

// NewConn creates a new connection wrapper. The transport is not started until
// the first call (ListTools/CallTool).
func NewConn(serverName, url, authToken string, opts ...ConnOption) *Conn {
	conn := &Conn{
		serverName: serverName,
		url:        url,
		authToken:  authToken,
	}
	for _, opt := range opts {
		opt(conn)
	}
	return conn
}

// ServerName returns the operator-assigned name of the MCP server.
func (c *Conn) ServerName() string { return c.serverName }

// injectHeadersTransport wraps an http.RoundTripper to inject the bearer auth
// header and W3C/B3 trace context on every outbound request. Replaces the
// per-call header function exposed by the previous SDK.
type injectHeadersTransport struct {
	base          http.RoundTripper
	authToken     string
	tokenProvider tokenProvider
}

func (t *injectHeadersTransport) RoundTrip(req *http.Request) (*http.Response, error) {
	// Clone so we don't mutate caller-owned headers.
	clone := req.Clone(req.Context())
	otel.GetTextMapPropagator().Inject(clone.Context(), propagation.HeaderCarrier(clone.Header))
	token := t.authToken
	if t.tokenProvider != nil {
		var err error
		token, err = t.tokenProvider(clone.Context())
		if err != nil {
			return nil, err
		}
	}
	if token != "" {
		clone.Header.Set("Authorization", "Bearer "+token)
	}
	return t.base.RoundTrip(clone)
}

func (c *Conn) ensureClient(ctx context.Context) error {
	c.mu.Lock()
	defer c.mu.Unlock()
	if c.session != nil && c.initialized {
		return nil
	}
	if c.session != nil {
		_ = c.session.Close()
		c.session = nil
	}

	httpClient := &http.Client{
		Timeout: 60 * time.Second,
		Transport: &injectHeadersTransport{
			base:          http.DefaultTransport,
			authToken:     c.authToken,
			tokenProvider: c.tokenProvider,
		},
	}

	c.client = mcp.NewClient(&mcp.Implementation{
		Name:    "lending-claw",
		Version: "1.0.0",
	}, nil)

	transport := &mcp.StreamableClientTransport{
		Endpoint:             c.url,
		HTTPClient:           httpClient,
		DisableStandaloneSSE: true,
	}

	sess, err := c.client.Connect(ctx, transport, nil)
	if err != nil {
		return fmt.Errorf("connect mcp %s: %w", c.serverName, err)
	}

	c.session = sess
	c.initialized = true
	return nil
}

// ListTools discovers tools exposed by the MCP server.
func (c *Conn) ListTools(ctx context.Context) ([]*mcp.Tool, error) {
	if err := c.ensureClient(ctx); err != nil {
		return nil, err
	}
	res, err := c.session.ListTools(ctx, &mcp.ListToolsParams{})
	if err != nil {
		c.markBroken()
		return nil, fmt.Errorf("list tools on %s: %w", c.serverName, err)
	}
	return res.Tools, nil
}

// CallTool invokes a tool on the MCP server and returns its result.
func (c *Conn) CallTool(ctx context.Context, name string, args map[string]any) (*mcp.CallToolResult, error) {
	if err := c.ensureClient(ctx); err != nil {
		return nil, err
	}
	res, err := c.session.CallTool(ctx, &mcp.CallToolParams{
		Name:      name,
		Arguments: args,
	})
	if err != nil {
		c.markBroken()
		return nil, fmt.Errorf("call tool %s on %s: %w", name, c.serverName, err)
	}
	return res, nil
}

// Close releases the underlying session.
func (c *Conn) Close() error {
	c.mu.Lock()
	defer c.mu.Unlock()
	if c.session == nil {
		return nil
	}
	err := c.session.Close()
	c.session = nil
	c.client = nil
	c.initialized = false
	return err
}

func (c *Conn) markBroken() {
	c.mu.Lock()
	c.initialized = false
	c.mu.Unlock()
}
