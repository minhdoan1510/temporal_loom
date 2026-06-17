package mcp

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"net/url"
	"testing"
	"time"

	"gitlab.zalopay.vn/fin/lending/lending-claw/internal/store"
)

func TestApplyOAuthProviderPresetSupportsNotion(t *testing.T) {
	srv := store.MCPServer{
		WorkspaceID: "ws",
		Name:        "custom",
	}

	if err := ApplyOAuthProviderPreset(&srv, OAuthProviderNotion); err != nil {
		t.Fatalf("ApplyOAuthProviderPreset: %v", err)
	}

	if srv.Name != "notion" {
		t.Fatalf("Name = %q, want notion", srv.Name)
	}
	if srv.URL != NotionMCPURL {
		t.Fatalf("URL = %q, want %q", srv.URL, NotionMCPURL)
	}
	if srv.AuthType != store.MCPAuthOAuth {
		t.Fatalf("AuthType = %q, want %q", srv.AuthType, store.MCPAuthOAuth)
	}
	if srv.OAuthConfig == nil || srv.OAuthConfig.Provider != OAuthProviderNotion {
		t.Fatalf("OAuth provider = %#v, want notion", srv.OAuthConfig)
	}
	if !srv.Enabled {
		t.Fatal("Notion preset should default to enabled")
	}
}

func TestStartOAuthDiscoversRegistersAndStoresChallenge(t *testing.T) {
	ctx := context.Background()
	authServer := newOAuthTestServer(t)
	defer authServer.Close()

	srv := store.MCPServer{
		WorkspaceID: "ws",
		Name:        "notion",
		URL:         authServer.URL + "/mcp",
		AuthType:    store.MCPAuthOAuth,
		OAuthConfig: &store.MCPOAuthConfig{Provider: OAuthProviderNotion},
		Description: "Notion",
		Enabled:     true,
		LastSynced:  nil,
		AuthToken:   "",
		CreatedAt:   time.Now(),
		UpdatedAt:   time.Now(),
	}
	redirectURI := "http://127.0.0.1:5173/api/v1/workspaces/ws/mcp/servers/notion/oauth/callback"

	start, updated, err := StartOAuth(ctx, srv, redirectURI, authServer.Client())
	if err != nil {
		t.Fatalf("StartOAuth: %v", err)
	}

	if start.AuthorizationURL == "" {
		t.Fatal("AuthorizationURL is empty")
	}
	if updated.OAuthConfig == nil {
		t.Fatal("OAuthConfig is nil")
	}
	if updated.OAuthConfig.ClientID != "client-123" {
		t.Fatalf("ClientID = %q, want client-123", updated.OAuthConfig.ClientID)
	}
	if updated.OAuthConfig.CodeVerifier == "" {
		t.Fatal("CodeVerifier was not stored")
	}
	if updated.OAuthConfig.State == "" {
		t.Fatal("State was not stored")
	}
	if updated.OAuthConfig.TokenEndpoint != authServer.URL+"/token" {
		t.Fatalf("TokenEndpoint = %q", updated.OAuthConfig.TokenEndpoint)
	}
	if updated.OAuthConfig.RedirectURI != redirectURI {
		t.Fatalf("RedirectURI = %q, want %q", updated.OAuthConfig.RedirectURI, redirectURI)
	}

	authURL, err := url.Parse(start.AuthorizationURL)
	if err != nil {
		t.Fatalf("parse authorization url: %v", err)
	}
	q := authURL.Query()
	if q.Get("client_id") != "client-123" {
		t.Fatalf("client_id = %q", q.Get("client_id"))
	}
	if q.Get("code_challenge") == "" {
		t.Fatal("code_challenge is empty")
	}
	if q.Get("code_challenge_method") != "S256" {
		t.Fatalf("code_challenge_method = %q, want S256", q.Get("code_challenge_method"))
	}
	if q.Get("state") != updated.OAuthConfig.State {
		t.Fatalf("state in URL does not match stored state")
	}
	if q.Get("resource") != srv.URL {
		t.Fatalf("resource = %q, want %q", q.Get("resource"), srv.URL)
	}
}

func TestCompleteOAuthRejectsWrongState(t *testing.T) {
	ctx := context.Background()
	authServer := newOAuthTestServer(t)
	defer authServer.Close()

	srv := store.MCPServer{
		WorkspaceID: "ws",
		Name:        "notion",
		URL:         authServer.URL + "/mcp",
		AuthType:    store.MCPAuthOAuth,
		OAuthConfig: &store.MCPOAuthConfig{
			Provider:       OAuthProviderNotion,
			ClientID:       "client-123",
			TokenEndpoint:  authServer.URL + "/token",
			RedirectURI:    "http://127.0.0.1/callback",
			State:          "expected-state",
			CodeVerifier:   "verifier",
			StateExpiresAt: ptrTime(time.Now().Add(5 * time.Minute)),
		},
	}

	if _, err := CompleteOAuth(ctx, srv, "code", "wrong-state", authServer.Client()); err == nil {
		t.Fatal("CompleteOAuth succeeded with wrong state")
	}
	if authServer.tokenRequests != 0 {
		t.Fatalf("token endpoint was called %d times; want 0", authServer.tokenRequests)
	}
}

func TestCompleteOAuthExchangesCodeAndClearsPendingChallenge(t *testing.T) {
	ctx := context.Background()
	authServer := newOAuthTestServer(t)
	defer authServer.Close()
	expiresAt := time.Now().Add(5 * time.Minute)

	srv := store.MCPServer{
		WorkspaceID: "ws",
		Name:        "notion",
		URL:         authServer.URL + "/mcp",
		AuthType:    store.MCPAuthOAuth,
		OAuthConfig: &store.MCPOAuthConfig{
			Provider:       OAuthProviderNotion,
			ClientID:       "client-123",
			TokenEndpoint:  authServer.URL + "/token",
			RedirectURI:    "http://127.0.0.1/callback",
			State:          "expected-state",
			CodeVerifier:   "verifier",
			StateExpiresAt: &expiresAt,
		},
	}

	updated, err := CompleteOAuth(ctx, srv, "auth-code", "expected-state", authServer.Client())
	if err != nil {
		t.Fatalf("CompleteOAuth: %v", err)
	}

	if updated.OAuthConfig.AccessToken != "access-from-code" {
		t.Fatalf("AccessToken = %q", updated.OAuthConfig.AccessToken)
	}
	if updated.OAuthConfig.RefreshToken != "refresh-from-code" {
		t.Fatalf("RefreshToken = %q", updated.OAuthConfig.RefreshToken)
	}
	if updated.OAuthConfig.ExpiresAt == nil || !updated.OAuthConfig.ExpiresAt.After(time.Now()) {
		t.Fatalf("ExpiresAt was not set in the future: %#v", updated.OAuthConfig.ExpiresAt)
	}
	if updated.OAuthConfig.State != "" || updated.OAuthConfig.CodeVerifier != "" || updated.OAuthConfig.StateExpiresAt != nil {
		t.Fatalf("pending OAuth challenge was not cleared: %#v", updated.OAuthConfig)
	}
}

func TestRefreshOAuthRefreshesExpiredTokenAndPersistsRotation(t *testing.T) {
	ctx := context.Background()
	authServer := newOAuthTestServer(t)
	defer authServer.Close()
	now := time.Now()

	srv := store.MCPServer{
		WorkspaceID: "ws",
		Name:        "notion",
		URL:         authServer.URL + "/mcp",
		AuthType:    store.MCPAuthOAuth,
		OAuthConfig: &store.MCPOAuthConfig{
			Provider:      OAuthProviderNotion,
			ClientID:      "client-123",
			TokenEndpoint: authServer.URL + "/token",
			AccessToken:   "expired-access",
			RefreshToken:  "old-refresh",
			ExpiresAt:     ptrTime(now.Add(-time.Minute)),
		},
	}

	updated, refreshed, err := RefreshOAuth(ctx, srv, authServer.Client(), now)
	if err != nil {
		t.Fatalf("RefreshOAuth: %v", err)
	}
	if !refreshed {
		t.Fatal("RefreshOAuth refreshed = false, want true")
	}
	if updated.OAuthConfig.AccessToken != "access-from-refresh" {
		t.Fatalf("AccessToken = %q", updated.OAuthConfig.AccessToken)
	}
	if updated.OAuthConfig.RefreshToken != "rotated-refresh" {
		t.Fatalf("RefreshToken = %q", updated.OAuthConfig.RefreshToken)
	}
	if updated.OAuthConfig.ExpiresAt == nil || !updated.OAuthConfig.ExpiresAt.After(now) {
		t.Fatalf("ExpiresAt was not updated: %#v", updated.OAuthConfig.ExpiresAt)
	}
}

func TestInjectHeadersTransportUsesDynamicTokenProvider(t *testing.T) {
	calls := 0
	transport := &injectHeadersTransport{
		base: roundTripFunc(func(req *http.Request) (*http.Response, error) {
			if got := req.Header.Get("Authorization"); got != "Bearer oauth-access" {
				t.Fatalf("Authorization header = %q", got)
			}
			return &http.Response{StatusCode: http.StatusOK, Body: http.NoBody}, nil
		}),
		tokenProvider: func(ctx context.Context) (string, error) {
			calls++
			return "oauth-access", nil
		},
	}

	req := httptest.NewRequest(http.MethodGet, "http://example.test/mcp", nil)
	if _, err := transport.RoundTrip(req); err != nil {
		t.Fatalf("RoundTrip: %v", err)
	}
	if calls != 1 {
		t.Fatalf("token provider calls = %d, want 1", calls)
	}
}

func TestInjectHeadersTransportPropagatesTokenProviderError(t *testing.T) {
	wantErr := errors.New("refresh failed")
	transport := &injectHeadersTransport{
		base: roundTripFunc(func(req *http.Request) (*http.Response, error) {
			t.Fatal("base transport should not be called")
			return nil, nil
		}),
		tokenProvider: func(ctx context.Context) (string, error) {
			return "", wantErr
		},
	}

	req := httptest.NewRequest(http.MethodGet, "http://example.test/mcp", nil)
	if _, err := transport.RoundTrip(req); !errors.Is(err, wantErr) {
		t.Fatalf("RoundTrip error = %v, want %v", err, wantErr)
	}
}

func TestManagerOAuthTokenProviderRefreshesAndPersistsToken(t *testing.T) {
	ctx := context.Background()
	authServer := newOAuthTestServer(t)
	defer authServer.Close()
	now := time.Now()
	fakeStore := &fakeMCPServerStore{
		server: store.MCPServer{
			WorkspaceID: "ws",
			Name:        "notion",
			URL:         authServer.URL + "/mcp",
			AuthType:    store.MCPAuthOAuth,
			OAuthConfig: &store.MCPOAuthConfig{
				Provider:      OAuthProviderNotion,
				ClientID:      "client-123",
				TokenEndpoint: authServer.URL + "/token",
				AccessToken:   "expired-access",
				RefreshToken:  "old-refresh",
				ExpiresAt:     ptrTime(now.Add(-time.Minute)),
			},
		},
	}
	mgr := &Manager{store: fakeStore}

	token, err := mgr.oauthTokenProvider("ws", "notion", authServer.Client())(ctx)
	if err != nil {
		t.Fatalf("oauthTokenProvider: %v", err)
	}
	if token != "access-from-refresh" {
		t.Fatalf("token = %q, want access-from-refresh", token)
	}
	if fakeStore.updates != 1 {
		t.Fatalf("updates = %d, want 1", fakeStore.updates)
	}
	if fakeStore.server.OAuthConfig.RefreshToken != "rotated-refresh" {
		t.Fatalf("persisted refresh token = %q", fakeStore.server.OAuthConfig.RefreshToken)
	}
}

type oauthTestServer struct {
	*httptest.Server
	tokenRequests int
}

func newOAuthTestServer(t *testing.T) *oauthTestServer {
	t.Helper()
	ts := &oauthTestServer{}
	mux := http.NewServeMux()

	mux.HandleFunc("/.well-known/oauth-protected-resource/mcp", func(w http.ResponseWriter, r *http.Request) {
		writeTestJSON(w, map[string]any{
			"resource":              ts.URL + "/mcp",
			"authorization_servers": []string{ts.URL},
			"scopes_supported":      []string{"read", "write"},
		})
	})
	mux.HandleFunc("/.well-known/oauth-authorization-server", func(w http.ResponseWriter, r *http.Request) {
		writeTestJSON(w, map[string]any{
			"issuer":                                ts.URL,
			"authorization_endpoint":                ts.URL + "/authorize",
			"token_endpoint":                        ts.URL + "/token",
			"registration_endpoint":                 ts.URL + "/register",
			"response_types_supported":              []string{"code"},
			"grant_types_supported":                 []string{"authorization_code", "refresh_token"},
			"token_endpoint_auth_methods_supported": []string{"none"},
			"code_challenge_methods_supported":      []string{"S256"},
		})
	})
	mux.HandleFunc("/register", func(w http.ResponseWriter, r *http.Request) {
		var body struct {
			RedirectURIs            []string `json:"redirect_uris"`
			TokenEndpointAuthMethod string   `json:"token_endpoint_auth_method"`
			GrantTypes              []string `json:"grant_types"`
		}
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			t.Fatalf("decode registration: %v", err)
		}
		if len(body.RedirectURIs) != 1 || body.RedirectURIs[0] == "" {
			t.Fatalf("bad redirect_uris: %#v", body.RedirectURIs)
		}
		if body.TokenEndpointAuthMethod != "none" {
			t.Fatalf("token auth method = %q, want none", body.TokenEndpointAuthMethod)
		}
		writeTestJSON(w, map[string]any{
			"client_id":                  "client-123",
			"redirect_uris":              body.RedirectURIs,
			"token_endpoint_auth_method": "none",
		})
	})
	mux.HandleFunc("/token", func(w http.ResponseWriter, r *http.Request) {
		ts.tokenRequests++
		if err := r.ParseForm(); err != nil {
			t.Fatalf("ParseForm: %v", err)
		}
		switch r.Form.Get("grant_type") {
		case "authorization_code":
			if r.Form.Get("code") != "auth-code" {
				t.Fatalf("code = %q", r.Form.Get("code"))
			}
			if r.Form.Get("code_verifier") != "verifier" {
				t.Fatalf("code_verifier = %q", r.Form.Get("code_verifier"))
			}
			writeTestJSON(w, map[string]any{
				"access_token":  "access-from-code",
				"refresh_token": "refresh-from-code",
				"token_type":    "Bearer",
				"expires_in":    3600,
			})
		case "refresh_token":
			if r.Form.Get("refresh_token") != "old-refresh" {
				t.Fatalf("refresh_token = %q", r.Form.Get("refresh_token"))
			}
			writeTestJSON(w, map[string]any{
				"access_token":  "access-from-refresh",
				"refresh_token": "rotated-refresh",
				"token_type":    "Bearer",
				"expires_in":    3600,
			})
		default:
			t.Fatalf("grant_type = %q", r.Form.Get("grant_type"))
		}
	})

	ts.Server = httptest.NewServer(mux)
	return ts
}

func ptrTime(t time.Time) *time.Time {
	return &t
}

func writeTestJSON(w http.ResponseWriter, v any) {
	w.Header().Set("Content-Type", "application/json")
	if err := json.NewEncoder(w).Encode(v); err != nil {
		panic(err)
	}
}

type roundTripFunc func(*http.Request) (*http.Response, error)

func (f roundTripFunc) RoundTrip(req *http.Request) (*http.Response, error) {
	return f(req)
}

type fakeMCPServerStore struct {
	store.MCPServer
	server  store.MCPServer
	updates int
}

func (s *fakeMCPServerStore) List(ctx context.Context, workspaceID string) ([]store.MCPServer, error) {
	return nil, nil
}

func (s *fakeMCPServerStore) ListAllServers(ctx context.Context) ([]store.MCPServer, error) {
	return nil, nil
}

func (s *fakeMCPServerStore) Get(ctx context.Context, workspaceID, name string) (*store.MCPServer, error) {
	return &s.server, nil
}

func (s *fakeMCPServerStore) Create(ctx context.Context, srv store.MCPServer) error {
	s.server = srv
	return nil
}

func (s *fakeMCPServerStore) Update(ctx context.Context, srv store.MCPServer) error {
	s.server = srv
	s.updates++
	return nil
}

func (s *fakeMCPServerStore) Delete(ctx context.Context, workspaceID, name string) error {
	return nil
}

func (s *fakeMCPServerStore) SyncFunctions(ctx context.Context, workspaceID, serverName string, funcs []store.MCPFunction) error {
	return nil
}

func (s *fakeMCPServerStore) SetFunctionEnabled(ctx context.Context, workspaceID, serverName, funcName string, enabled bool) error {
	return nil
}

func (s *fakeMCPServerStore) ListFunctions(ctx context.Context, workspaceID, serverName string) ([]store.MCPFunction, error) {
	return nil, nil
}

func (s *fakeMCPServerStore) ListAllFunctions(ctx context.Context, workspaceID string) (map[string][]store.MCPFunction, error) {
	return nil, nil
}
