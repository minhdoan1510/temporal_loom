package mcp

import (
	"context"
	"errors"
	"fmt"
	"net/http"
	"net/url"
	"strings"
	"time"

	"github.com/modelcontextprotocol/go-sdk/auth"
	"github.com/modelcontextprotocol/go-sdk/oauthex"
	"golang.org/x/oauth2"

	"gitlab.zalopay.vn/fin/lending/lending-claw/internal/store"
)

const (
	OAuthProviderNotion = "notion"
	NotionMCPURL        = "https://mcp.notion.com/mcp"
)

type OAuthStart struct {
	AuthorizationURL string `json:"authorization_url"`
}

// ApplyOAuthProviderPreset fills a server registration for a supported hosted
// OAuth MCP provider.
func ApplyOAuthProviderPreset(srv *store.MCPServer, provider string) error {
	if srv == nil {
		return errors.New("server is required")
	}
	switch strings.ToLower(strings.TrimSpace(provider)) {
	case OAuthProviderNotion:
		srv.Name = OAuthProviderNotion
		srv.URL = NotionMCPURL
		srv.AuthType = store.MCPAuthOAuth
		srv.AuthToken = ""
		srv.Enabled = true
		if srv.Description == "" {
			srv.Description = "Notion workspace MCP"
		}
		if srv.OAuthConfig == nil {
			srv.OAuthConfig = &store.MCPOAuthConfig{}
		}
		srv.OAuthConfig.Provider = OAuthProviderNotion
		return nil
	default:
		return fmt.Errorf("unsupported OAuth MCP provider %q", provider)
	}
}

func StartOAuth(ctx context.Context, srv store.MCPServer, redirectURI string, client *http.Client) (*OAuthStart, store.MCPServer, error) {
	if srv.EffectiveAuthType() != store.MCPAuthOAuth {
		return nil, srv, errors.New("server is not configured for OAuth")
	}
	if redirectURI == "" {
		return nil, srv, errors.New("redirect_uri is required")
	}
	if client == nil {
		client = http.DefaultClient
	}

	prm, asm, err := discoverOAuth(ctx, srv.URL, client)
	if err != nil {
		return nil, srv, err
	}

	reg, err := oauthex.RegisterClient(ctx, asm.RegistrationEndpoint, &oauthex.ClientRegistrationMetadata{
		RedirectURIs:            []string{redirectURI},
		TokenEndpointAuthMethod: "none",
		GrantTypes:              []string{"authorization_code", "refresh_token"},
		ResponseTypes:           []string{"code"},
		ClientName:              "Lending Claw",
	}, client)
	if err != nil {
		return nil, srv, fmt.Errorf("register OAuth client: %w", err)
	}

	codeVerifier := oauth2.GenerateVerifier()
	state := randomState()
	scopes := prm.ScopesSupported
	if len(scopes) == 0 {
		scopes = asm.ScopesSupported
	}
	oauthCfg := &oauth2.Config{
		ClientID: reg.ClientID,
		Endpoint: oauth2.Endpoint{
			AuthURL:   asm.AuthorizationEndpoint,
			TokenURL:  asm.TokenEndpoint,
			AuthStyle: oauthAuthStyle(reg.TokenEndpointAuthMethod),
		},
		RedirectURL: redirectURI,
		Scopes:      scopes,
	}
	if reg.ClientSecret != "" {
		oauthCfg.ClientSecret = reg.ClientSecret
	}
	authURL := oauthCfg.AuthCodeURL(state,
		oauth2.S256ChallengeOption(codeVerifier),
		oauth2.SetAuthURLParam("resource", prm.Resource),
	)

	cfg := cloneOAuthConfig(srv.OAuthConfig)
	cfg.ClientID = reg.ClientID
	cfg.ClientSecret = reg.ClientSecret
	cfg.TokenEndpointAuthMethod = reg.TokenEndpointAuthMethod
	cfg.AuthorizationEndpoint = asm.AuthorizationEndpoint
	cfg.TokenEndpoint = asm.TokenEndpoint
	cfg.RegistrationEndpoint = asm.RegistrationEndpoint
	cfg.Resource = prm.Resource
	cfg.RedirectURI = redirectURI
	cfg.Scope = strings.Join(scopes, " ")
	cfg.State = state
	cfg.CodeVerifier = codeVerifier
	cfg.StateExpiresAt = timePtr(time.Now().Add(10 * time.Minute))
	if cfg.Provider == "" {
		cfg.Provider = strings.ToLower(srv.Name)
	}
	srv.AuthType = store.MCPAuthOAuth
	srv.OAuthConfig = cfg
	srv.AuthToken = ""

	return &OAuthStart{AuthorizationURL: authURL}, srv, nil
}

func CompleteOAuth(ctx context.Context, srv store.MCPServer, code, state string, client *http.Client) (store.MCPServer, error) {
	cfg := srv.OAuthConfig
	if srv.EffectiveAuthType() != store.MCPAuthOAuth || cfg == nil {
		return srv, errors.New("server is not configured for OAuth")
	}
	if code == "" {
		return srv, errors.New("authorization code is required")
	}
	if cfg.State == "" || state == "" || state != cfg.State {
		return srv, errors.New("invalid OAuth state")
	}
	if cfg.StateExpiresAt == nil || time.Now().After(*cfg.StateExpiresAt) {
		return srv, errors.New("OAuth state expired")
	}
	if cfg.CodeVerifier == "" {
		return srv, errors.New("OAuth code verifier is missing")
	}
	if client == nil {
		client = http.DefaultClient
	}

	oauthCfg := oauth2Config(cfg)
	clientCtx := context.WithValue(ctx, oauth2.HTTPClient, client)
	token, err := oauthCfg.Exchange(clientCtx, code,
		oauth2.VerifierOption(cfg.CodeVerifier),
		oauth2.SetAuthURLParam("resource", oauthResource(srv)),
	)
	if err != nil {
		return srv, fmt.Errorf("exchange OAuth code: %w", err)
	}
	applyToken(cfg, token, time.Now())
	cfg.State = ""
	cfg.CodeVerifier = ""
	cfg.StateExpiresAt = nil
	srv.OAuthConfig = cfg
	return srv, nil
}

func RefreshOAuth(ctx context.Context, srv store.MCPServer, client *http.Client, now time.Time) (store.MCPServer, bool, error) {
	cfg := srv.OAuthConfig
	if srv.EffectiveAuthType() != store.MCPAuthOAuth || cfg == nil {
		return srv, false, nil
	}
	if cfg.RefreshToken == "" {
		if cfg.AccessToken == "" {
			return srv, false, errors.New("OAuth authentication required")
		}
		return srv, false, nil
	}
	if cfg.ExpiresAt != nil && cfg.ExpiresAt.After(now.Add(2*time.Minute)) {
		return srv, false, nil
	}
	if client == nil {
		client = http.DefaultClient
	}
	oauthCfg := oauth2Config(cfg)
	clientCtx := context.WithValue(ctx, oauth2.HTTPClient, client)
	oldRefresh := cfg.RefreshToken
	token := &oauth2.Token{
		AccessToken:  cfg.AccessToken,
		RefreshToken: cfg.RefreshToken,
		TokenType:    cfg.TokenType,
		Expiry:       now.Add(-time.Minute),
	}
	newToken, err := oauthCfg.TokenSource(clientCtx, token).Token()
	if err != nil {
		return srv, false, fmt.Errorf("refresh OAuth token: %w", err)
	}
	applyToken(cfg, newToken, now)
	if cfg.RefreshToken == "" {
		cfg.RefreshToken = oldRefresh
	}
	srv.OAuthConfig = cfg
	return srv, true, nil
}

func discoverOAuth(ctx context.Context, mcpURL string, client *http.Client) (*oauthex.ProtectedResourceMetadata, *oauthex.AuthServerMeta, error) {
	prm, err := discoverProtectedResource(ctx, mcpURL, client)
	if err != nil {
		return nil, nil, err
	}
	if len(prm.AuthorizationServers) == 0 {
		return nil, nil, errors.New("protected resource metadata has no authorization servers")
	}
	asm, err := auth.GetAuthServerMetadata(ctx, prm.AuthorizationServers[0], client)
	if err != nil {
		return nil, nil, fmt.Errorf("discover authorization server metadata: %w", err)
	}
	if asm == nil {
		return nil, nil, errors.New("authorization server metadata not found")
	}
	if asm.RegistrationEndpoint == "" {
		return nil, nil, errors.New("authorization server does not support dynamic client registration")
	}
	return prm, asm, nil
}

func discoverProtectedResource(ctx context.Context, mcpURL string, client *http.Client) (*oauthex.ProtectedResourceMetadata, error) {
	for _, candidate := range protectedResourceMetadataCandidates(mcpURL) {
		prm, err := oauthex.GetProtectedResourceMetadata(ctx, candidate.metadataURL, candidate.resourceURL, client)
		if err == nil && prm != nil {
			return prm, nil
		}
	}
	return nil, errors.New("protected resource metadata not found")
}

type resourceMetadataCandidate struct {
	metadataURL string
	resourceURL string
}

func protectedResourceMetadataCandidates(resourceURL string) []resourceMetadataCandidate {
	u, err := url.Parse(resourceURL)
	if err != nil {
		return nil
	}
	var out []resourceMetadataCandidate
	pathCandidate := *u
	pathCandidate.Path = "/.well-known/oauth-protected-resource/" + strings.TrimLeft(u.Path, "/")
	out = append(out, resourceMetadataCandidate{
		metadataURL: pathCandidate.String(),
		resourceURL: resourceURL,
	})
	rootResource := *u
	rootResource.Path = ""
	rootCandidate := *u
	rootCandidate.Path = "/.well-known/oauth-protected-resource"
	out = append(out, resourceMetadataCandidate{
		metadataURL: rootCandidate.String(),
		resourceURL: rootResource.String(),
	})
	return out
}

func oauth2Config(cfg *store.MCPOAuthConfig) *oauth2.Config {
	c := &oauth2.Config{
		ClientID: cfg.ClientID,
		Endpoint: oauth2.Endpoint{
			AuthURL:   cfg.AuthorizationEndpoint,
			TokenURL:  cfg.TokenEndpoint,
			AuthStyle: oauthAuthStyle(cfg.TokenEndpointAuthMethod),
		},
		RedirectURL: cfg.RedirectURI,
	}
	if cfg.ClientSecret != "" {
		c.ClientSecret = cfg.ClientSecret
	}
	if cfg.Scope != "" {
		c.Scopes = strings.Fields(cfg.Scope)
	}
	return c
}

func oauthAuthStyle(method string) oauth2.AuthStyle {
	switch method {
	case "client_secret_basic":
		return oauth2.AuthStyleInHeader
	case "none", "client_secret_post", "":
		return oauth2.AuthStyleInParams
	default:
		return oauth2.AuthStyleAutoDetect
	}
}

func oauthResource(srv store.MCPServer) string {
	if srv.OAuthConfig != nil && srv.OAuthConfig.Resource != "" {
		return srv.OAuthConfig.Resource
	}
	return srv.URL
}

func applyToken(cfg *store.MCPOAuthConfig, token *oauth2.Token, now time.Time) {
	cfg.AccessToken = token.AccessToken
	cfg.RefreshToken = token.RefreshToken
	cfg.TokenType = token.TokenType
	if cfg.TokenType == "" {
		cfg.TokenType = "Bearer"
	}
	if !token.Expiry.IsZero() {
		cfg.ExpiresAt = timePtr(token.Expiry)
	} else if expiresIn, ok := token.Extra("expires_in").(int64); ok && expiresIn > 0 {
		cfg.ExpiresAt = timePtr(now.Add(time.Duration(expiresIn) * time.Second))
	}
	if scope, ok := token.Extra("scope").(string); ok && scope != "" {
		cfg.Scope = scope
	}
}

func cloneOAuthConfig(cfg *store.MCPOAuthConfig) *store.MCPOAuthConfig {
	if cfg == nil {
		return &store.MCPOAuthConfig{}
	}
	cp := *cfg
	return &cp
}

func randomState() string {
	return strings.ReplaceAll(oauth2.GenerateVerifier(), "_", "-")
}

func timePtr(t time.Time) *time.Time {
	return &t
}
