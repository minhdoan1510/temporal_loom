package mcp

import (
	"context"
	"fmt"
	"log/slog"
	"net/http"
	"sync"
	"time"

	"gitlab.zalopay.vn/fin/lending/lending-claw/internal/store"
	"gitlab.zalopay.vn/fin/lending/lending-claw/internal/tools"
)

// Manager owns the connections to all enabled MCP servers (across all
// workspaces) and registers each enabled function into the shared
// tools.Registry as a workspace-scoped RemoteTool adapter. Servers are keyed
// by (workspace, server name) so the same server name can exist in multiple
// workspaces without colliding.
//
// Manager is safe for concurrent use.
type Manager struct {
	store   store.MCPServerStore
	toolsR  *tools.Registry
	mu      sync.Mutex
	servers map[string]*serverState // by (workspace, server name)
}

type serverState struct {
	workspaceID string
	serverName  string
	conn        *Conn
	toolNames   []string // names registered into toolsR (so we can unregister)
}

// stateKey builds the manager's map key for a (workspace, server) pair.
func stateKey(workspaceID, serverName string) string {
	return workspaceID + "\x00" + serverName
}

// NewManager constructs an empty manager.
func NewManager(s store.MCPServerStore, reg *tools.Registry) *Manager {
	return &Manager{
		store:   s,
		toolsR:  reg,
		servers: make(map[string]*serverState),
	}
}

// LoadAll iterates every enabled mcp_servers row across all workspaces and
// registers the enabled functions from the cached DB rows. No tools/list call
// is made — startup is fast and offline-tolerant.
func (m *Manager) LoadAll(ctx context.Context) error {
	if m == nil || m.store == nil {
		return nil
	}
	servers, err := m.store.ListAllServers(ctx)
	if err != nil {
		return fmt.Errorf("list mcp servers: %w", err)
	}
	for _, s := range servers {
		if !s.Enabled {
			continue
		}
		if err := m.LoadFromCache(ctx, s); err != nil {
			slog.WarnContext(ctx, "mcp.load_failed",
				"workspace", s.WorkspaceID, "server", s.Name, "error", err)
		}
	}
	return nil
}

// LoadFromCache (re)registers the enabled cached functions for a single
// server. It opens a fresh Conn (lazy — no network call yet) and registers
// RemoteTool adapters using the schema persisted in mcp_functions.
func (m *Manager) LoadFromCache(ctx context.Context, srv store.MCPServer) error {
	m.Remove(ctx, srv.WorkspaceID, srv.Name)

	funcs, err := m.store.ListFunctions(ctx, srv.WorkspaceID, srv.Name)
	if err != nil {
		return fmt.Errorf("list cached functions for %s: %w", srv.Name, err)
	}

	conn := m.newConn(srv)
	state := &serverState{workspaceID: srv.WorkspaceID, serverName: srv.Name, conn: conn}
	for _, f := range funcs {
		if !f.Enabled {
			continue
		}
		if !m.tryRegister(ctx, srv.WorkspaceID, srv.Name, conn, f) {
			continue
		}
		state.toolNames = append(state.toolNames, f.Name)
	}

	m.mu.Lock()
	m.servers[stateKey(srv.WorkspaceID, srv.Name)] = state
	m.mu.Unlock()

	slog.InfoContext(ctx, "mcp.server_loaded_from_cache",
		"workspace", srv.WorkspaceID, "server", srv.Name, "tools", len(state.toolNames))
	return nil
}

// Sync connects to the MCP server, calls tools/list, and reconciles the
// cached function rows. After the DB is updated, the in-memory registry is
// rebuilt from cache so the toggle state stays consistent.
func (m *Manager) Sync(ctx context.Context, srv store.MCPServer) error {
	conn := m.newConn(srv)
	defer func() {
		_ = conn.Close()
	}()

	mcpTools, err := conn.ListTools(ctx)
	if err != nil {
		return fmt.Errorf("list tools on %s: %w", srv.Name, err)
	}

	discovered := make([]store.MCPFunction, 0, len(mcpTools))
	for _, mt := range mcpTools {
		rt := NewRemoteTool(srv.Name, conn, mt)
		discovered = append(discovered, store.MCPFunction{
			WorkspaceID: srv.WorkspaceID,
			ServerName:  srv.Name,
			Name:        rt.Name(),
			Description: rt.Description(),
			SchemaJSON:  rt.SchemaJSON(),
		})
	}

	if err := m.store.SyncFunctions(ctx, srv.WorkspaceID, srv.Name, discovered); err != nil {
		return fmt.Errorf("persist discovered functions for %s: %w", srv.Name, err)
	}

	// Rebuild in-memory state from the now-updated cache.
	return m.LoadFromCache(ctx, srv)
}

// SetFunctionEnabled toggles a single function on/off. Updates the DB row
// then adds/removes the corresponding RemoteTool from the registry.
func (m *Manager) SetFunctionEnabled(ctx context.Context, workspaceID, serverName, funcName string, enabled bool) error {
	if err := m.store.SetFunctionEnabled(ctx, workspaceID, serverName, funcName, enabled); err != nil {
		return err
	}

	key := stateKey(workspaceID, serverName)
	m.mu.Lock()
	st, hasState := m.servers[key]
	m.mu.Unlock()

	if !hasState {
		return nil // server isn't loaded; nothing to do in-memory
	}

	if enabled {
		funcs, err := m.store.ListFunctions(ctx, workspaceID, serverName)
		if err != nil {
			return fmt.Errorf("reload functions for %s: %w", serverName, err)
		}
		var target *store.MCPFunction
		for i := range funcs {
			if funcs[i].Name == funcName {
				target = &funcs[i]
				break
			}
		}
		if target == nil {
			return fmt.Errorf("function %s/%s not found", serverName, funcName)
		}
		if m.tryRegister(ctx, workspaceID, serverName, st.conn, *target) {
			m.mu.Lock()
			st.toolNames = appendUnique(st.toolNames, funcName)
			m.mu.Unlock()
		}
	} else {
		m.toolsR.UnregisterForWorkspace(workspaceID, funcName)
		m.mu.Lock()
		st.toolNames = removeStr(st.toolNames, funcName)
		m.mu.Unlock()
	}
	return nil
}

// tryRegister registers a workspace-scoped RemoteTool built from a cached
// function row. Returns false if a non-MCP tool already owns the name in this
// workspace (collision is logged).
func (m *Manager) tryRegister(ctx context.Context, workspaceID, serverName string, conn *Conn, f store.MCPFunction) bool {
	rt := NewRemoteToolFromCache(serverName, conn, f.Name, f.Description, f.SchemaJSON)
	if existing, ok := m.toolsR.GetForWorkspace(workspaceID, rt.Name()); ok {
		if _, isRemote := existing.(*RemoteTool); !isRemote {
			slog.WarnContext(ctx, "mcp.tool_name_conflict_with_platform",
				"workspace", workspaceID, "server", serverName, "tool", rt.Name())
			return false
		}
	}
	m.toolsR.RegisterForWorkspace(workspaceID, rt)
	return true
}

func (m *Manager) newConn(srv store.MCPServer) *Conn {
	if srv.EffectiveAuthType() == store.MCPAuthOAuth {
		return NewConn(srv.Name, srv.URL, "", WithTokenProvider(m.oauthTokenProvider(srv.WorkspaceID, srv.Name, http.DefaultClient)))
	}
	return NewConn(srv.Name, srv.URL, srv.AuthToken)
}

func (m *Manager) oauthTokenProvider(workspaceID, serverName string, client *http.Client) tokenProvider {
	return func(ctx context.Context) (string, error) {
		if m == nil || m.store == nil {
			return "", fmt.Errorf("mcp OAuth store is not configured")
		}
		srv, err := m.store.Get(ctx, workspaceID, serverName)
		if err != nil {
			return "", err
		}
		if srv.EffectiveAuthType() != store.MCPAuthOAuth {
			return srv.AuthToken, nil
		}
		updated, refreshed, err := RefreshOAuth(ctx, *srv, client, time.Now())
		if err != nil {
			return "", err
		}
		if updated.OAuthConfig == nil || updated.OAuthConfig.AccessToken == "" {
			return "", fmt.Errorf("OAuth authentication required for MCP server %s", serverName)
		}
		if refreshed {
			if err := m.store.Update(ctx, updated); err != nil {
				return "", err
			}
		}
		return updated.OAuthConfig.AccessToken, nil
	}
}

// Remove disconnects from a server and unregisters its tools.
func (m *Manager) Remove(_ context.Context, workspaceID, serverName string) {
	key := stateKey(workspaceID, serverName)
	m.mu.Lock()
	st, ok := m.servers[key]
	if ok {
		delete(m.servers, key)
	}
	m.mu.Unlock()
	if !ok {
		return
	}
	for _, name := range st.toolNames {
		m.toolsR.UnregisterForWorkspace(workspaceID, name)
	}
	if st.conn != nil {
		_ = st.conn.Close()
	}
}

// CloseAll closes every open MCP connection. Safe to call multiple times.
func (m *Manager) CloseAll() {
	if m == nil {
		return
	}
	m.mu.Lock()
	servers := m.servers
	m.servers = make(map[string]*serverState)
	m.mu.Unlock()
	for _, st := range servers {
		for _, name := range st.toolNames {
			m.toolsR.UnregisterForWorkspace(st.workspaceID, name)
		}
		if st.conn != nil {
			_ = st.conn.Close()
		}
	}
}

func appendUnique(s []string, v string) []string {
	for _, x := range s {
		if x == v {
			return s
		}
	}
	return append(s, v)
}

func removeStr(s []string, v string) []string {
	for i, x := range s {
		if x == v {
			return append(s[:i], s[i+1:]...)
		}
	}
	return s
}
