package store

import (
	"context"
	"encoding/json"
	"time"
)

// MCPServer is an external MCP endpoint registered by an admin, scoped to a workspace.
type MCPServer struct {
	WorkspaceID string          `json:"workspace_id"`
	Name        string          `json:"name"`
	URL         string          `json:"url"`
	AuthToken   string          `json:"auth_token,omitempty"`
	AuthType    string          `json:"auth_type,omitempty"`
	OAuthConfig *MCPOAuthConfig `json:"-"`
	Enabled     bool            `json:"enabled"`
	Description string          `json:"description"`
	LastSynced  *time.Time      `json:"last_synced,omitempty"`
	CreatedAt   time.Time       `json:"created_at"`
	UpdatedAt   time.Time       `json:"updated_at"`
}

const (
	MCPAuthBearer = "bearer"
	MCPAuthOAuth  = "oauth"
)

// MCPOAuthConfig stores OAuth metadata and credentials for hosted MCP servers.
// Sensitive fields are encrypted by the concrete store when encryption is enabled.
type MCPOAuthConfig struct {
	Provider                string     `json:"provider,omitempty"`
	ClientID                string     `json:"client_id,omitempty"`
	ClientSecret            string     `json:"client_secret,omitempty"`
	TokenEndpointAuthMethod string     `json:"token_endpoint_auth_method,omitempty"`
	AuthorizationEndpoint   string     `json:"authorization_endpoint,omitempty"`
	TokenEndpoint           string     `json:"token_endpoint,omitempty"`
	RegistrationEndpoint    string     `json:"registration_endpoint,omitempty"`
	Resource                string     `json:"resource,omitempty"`
	RedirectURI             string     `json:"redirect_uri,omitempty"`
	Scope                   string     `json:"scope,omitempty"`
	AccessToken             string     `json:"access_token,omitempty"`
	RefreshToken            string     `json:"refresh_token,omitempty"`
	TokenType               string     `json:"token_type,omitempty"`
	ExpiresAt               *time.Time `json:"expires_at,omitempty"`
	State                   string     `json:"state,omitempty"`
	CodeVerifier            string     `json:"code_verifier,omitempty"`
	StateExpiresAt          *time.Time `json:"state_expires_at,omitempty"`
}

func (s MCPServer) EffectiveAuthType() string {
	if s.AuthType != "" {
		return s.AuthType
	}
	if s.OAuthConfig != nil {
		return MCPAuthOAuth
	}
	return MCPAuthBearer
}

func (s MCPServer) OAuthConnected() bool {
	return s.EffectiveAuthType() == MCPAuthOAuth &&
		s.OAuthConfig != nil &&
		s.OAuthConfig.AccessToken != ""
}

// MCPFunction is a tool/function discovered on an MCP server via tools/list.
// Enabled toggles whether the function is exposed to the agent's tool
// registry; admins can flip it per-function without removing the row.
type MCPFunction struct {
	WorkspaceID string          `json:"workspace_id"`
	ServerName  string          `json:"server_name"`
	Name        string          `json:"name"`
	Description string          `json:"description"`
	SchemaJSON  json.RawMessage `json:"schema_json"`
	Enabled     bool            `json:"enabled"`
	UpdatedAt   time.Time       `json:"updated_at"`
}

// MCPServerStore manages MCP server registrations and their discovered
// functions. Most methods are scoped to a workspace; ListAllServers spans all
// workspaces (used by the manager at startup).
type MCPServerStore interface {
	List(ctx context.Context, workspaceID string) ([]MCPServer, error)

	// ListAllServers returns every server across all workspaces, with
	// WorkspaceID populated. Used by the MCP manager on startup.
	ListAllServers(ctx context.Context) ([]MCPServer, error)

	Get(ctx context.Context, workspaceID, name string) (*MCPServer, error)
	Create(ctx context.Context, s MCPServer) error
	Update(ctx context.Context, s MCPServer) error
	Delete(ctx context.Context, workspaceID, name string) error

	// SyncFunctions reconciles the persisted function list with what was
	// returned by a fresh tools/list discovery: new rows are inserted with
	// enabled=true, rows still present have their description/schema
	// refreshed (enabled flag preserved), rows no longer present are
	// deleted. Bumps last_synced on the server. Single transaction.
	SyncFunctions(ctx context.Context, workspaceID, serverName string, funcs []MCPFunction) error

	// SetFunctionEnabled toggles a single function's enabled flag.
	SetFunctionEnabled(ctx context.Context, workspaceID, serverName, funcName string, enabled bool) error

	ListFunctions(ctx context.Context, workspaceID, serverName string) ([]MCPFunction, error)
	ListAllFunctions(ctx context.Context, workspaceID string) (map[string][]MCPFunction, error)
}
