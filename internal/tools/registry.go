package tools

import (
	"context"
	"log/slog"
	"sync"
	"time"

	"gitlab.zalopay.vn/fin/lending/lending-claw/internal/providers"
	"gitlab.zalopay.vn/fin/lending/lending-claw/pkg/langfuse"
)

// workspaceKey is the context key for the active workspace id.
type workspaceKey struct{}

// WithWorkspace stores the active workspace id in context. Tools and the
// registry use it to scope data and filter workspace-owned (MCP) tools.
func WithWorkspace(ctx context.Context, workspaceID string) context.Context {
	return context.WithValue(ctx, workspaceKey{}, workspaceID)
}

// WorkspaceFromContext returns the active workspace id, or "" if absent.
func WorkspaceFromContext(ctx context.Context) string {
	id, _ := ctx.Value(workspaceKey{}).(string)
	return id
}

// allowedToolsKey is the context key for RBAC-allowed tool names.
type allowedToolsKey struct{}

// WithAllowedTools stores the list of allowed tool names in context.
// A nil slice means all tools are allowed.
func WithAllowedTools(ctx context.Context, names []string) context.Context {
	return context.WithValue(ctx, allowedToolsKey{}, names)
}

// AllowedToolsFromContext returns the allowed tool names from context.
// Returns nil if no restriction is set (all tools allowed).
func AllowedToolsFromContext(ctx context.Context) []string {
	names, _ := ctx.Value(allowedToolsKey{}).([]string)
	return names
}

// entry is a registered tool plus its owning workspace. A blank workspace
// means the tool is global (platform tool) and visible in every workspace.
type entry struct {
	tool      Tool
	workspace string
}

// Registry manages tool registration and execution. Platform tools are
// registered globally; MCP tools are registered per workspace and only
// visible/executable within that workspace.
type Registry struct {
	entries   map[string]entry // key: regKey(workspace, name)
	mu        sync.RWMutex
	scrubbing bool
}

// regKey builds the storage key for a (workspace, tool name) pair. Global
// tools (blank workspace) are keyed by their bare name.
func regKey(workspace, name string) string {
	if workspace == "" {
		return name
	}
	return "ws\x00" + workspace + "\x00" + name
}

// NewRegistry creates a new tool registry with credential scrubbing enabled.
func NewRegistry() *Registry {
	return &Registry{
		entries:   make(map[string]entry),
		scrubbing: true,
	}
}

// SetScrubbing enables or disables credential scrubbing on tool output.
func (r *Registry) SetScrubbing(enabled bool) {
	r.scrubbing = enabled
}

// Register adds a global (platform) tool to the registry.
func (r *Registry) Register(tool Tool) {
	r.mu.Lock()
	defer r.mu.Unlock()
	r.entries[tool.Name()] = entry{tool: tool}
}

// RegisterForWorkspace adds a workspace-scoped tool (e.g. an MCP tool). It is
// only visible/executable within that workspace.
func (r *Registry) RegisterForWorkspace(workspaceID string, tool Tool) {
	r.mu.Lock()
	defer r.mu.Unlock()
	r.entries[regKey(workspaceID, tool.Name())] = entry{tool: tool, workspace: workspaceID}
}

// Unregister removes a global tool. Returns true if a tool was removed.
func (r *Registry) Unregister(name string) bool {
	r.mu.Lock()
	defer r.mu.Unlock()
	if _, ok := r.entries[name]; !ok {
		return false
	}
	delete(r.entries, name)
	return true
}

// UnregisterForWorkspace removes a workspace-scoped tool.
func (r *Registry) UnregisterForWorkspace(workspaceID, name string) bool {
	r.mu.Lock()
	defer r.mu.Unlock()
	key := regKey(workspaceID, name)
	if _, ok := r.entries[key]; !ok {
		return false
	}
	delete(r.entries, key)
	return true
}

// All returns a snapshot of every registered tool across all workspaces.
func (r *Registry) All() []Tool {
	r.mu.RLock()
	defer r.mu.RUnlock()
	out := make([]Tool, 0, len(r.entries))
	for _, e := range r.entries {
		out = append(out, e.tool)
	}
	return out
}

// AllForWorkspace returns the tools visible in the given workspace: all global
// (platform) tools plus that workspace's own MCP tools. Used to scope the RBAC
// resource list / role seeding so a workspace never sees another workspace's
// MCP tools.
func (r *Registry) AllForWorkspace(workspaceID string) []Tool {
	r.mu.RLock()
	defer r.mu.RUnlock()
	out := make([]Tool, 0, len(r.entries))
	for _, e := range r.entries {
		if e.visible(workspaceID) {
			out = append(out, e.tool)
		}
	}
	return out
}

// Get returns a global tool by name.
func (r *Registry) Get(name string) (Tool, bool) {
	r.mu.RLock()
	defer r.mu.RUnlock()
	e, ok := r.entries[name]
	return e.tool, ok
}

// GetForWorkspace returns a tool visible in the given workspace: a
// workspace-scoped tool of that name, falling back to a global tool.
func (r *Registry) GetForWorkspace(workspaceID, name string) (Tool, bool) {
	r.mu.RLock()
	defer r.mu.RUnlock()
	if e, ok := r.entries[regKey(workspaceID, name)]; ok {
		return e.tool, true
	}
	e, ok := r.entries[name]
	return e.tool, ok
}

// visible reports whether an entry is visible in the given workspace.
func (e entry) visible(workspaceID string) bool {
	return e.workspace == "" || e.workspace == workspaceID
}

// List returns tool names visible in the context workspace.
func (r *Registry) List(ctx ...context.Context) []string {
	ws := ctxWorkspace(ctx)
	r.mu.RLock()
	defer r.mu.RUnlock()

	names := make([]string, 0, len(r.entries))
	for _, e := range r.entries {
		if e.visible(ws) {
			names = append(names, e.tool.Name())
		}
	}
	return names
}

// Descriptions returns tool name → description for tools visible in the
// context workspace.
func (r *Registry) Descriptions(ctx ...context.Context) map[string]string {
	ws := ctxWorkspace(ctx)
	r.mu.RLock()
	defer r.mu.RUnlock()

	descs := make(map[string]string, len(r.entries))
	for _, e := range r.entries {
		if e.visible(ws) {
			descs[e.tool.Name()] = e.tool.Description()
		}
	}
	return descs
}

// ProviderDefs returns tool definitions for LLM provider APIs, filtered to the
// tools visible in the context workspace.
func (r *Registry) ProviderDefs(ctx ...context.Context) []providers.ToolDefinition {
	ws := ctxWorkspace(ctx)
	r.mu.RLock()
	defer r.mu.RUnlock()

	defs := make([]providers.ToolDefinition, 0, len(r.entries))
	for _, e := range r.entries {
		if e.visible(ws) {
			defs = append(defs, ToProviderDef(e.tool))
		}
	}
	return defs
}

// ctxWorkspace extracts the workspace id from an optional context arg.
func ctxWorkspace(ctx []context.Context) string {
	if len(ctx) > 0 && ctx[0] != nil {
		return WorkspaceFromContext(ctx[0])
	}
	return ""
}

// ExecuteWithContext runs a tool by name with the given arguments.
// Applies RBAC check, credential scrubbing, and logs execution.
func (r *Registry) ExecuteWithContext(ctx context.Context, name string, args map[string]interface{}) *Result {
	slog.InfoContext(ctx, "execute tool", "name", name, "args", args)
	ws := WorkspaceFromContext(ctx)
	tool, ok := r.GetForWorkspace(ws, name)
	if !ok {
		return ErrorResult("unknown tool: " + name)
	}

	// RBAC Layer: check allowed keys from context
	if allowed := AllowedToolsFromContext(ctx); allowed != nil {
		permKey := PermissionKeyOf(tool)
		if !isAllowed(permKey, allowed) {
			slog.WarnContext(ctx, "security.tool_denied", "tool", name, "permission_key", permKey)
			return ErrorResult("permission denied: current user can not use tool " + name + ". Please contact admin to get access.")
		}
	}

	ctx, span := langfuse.StartTool(ctx, name, args)

	start := time.Now()
	result := tool.Execute(ctx, args)
	duration := time.Since(start)

	slog.InfoContext(ctx, "tool executed", "name", name, "result", result)
	// Scrub credentials from tool output before returning to LLM
	if r.scrubbing {
		if result.ForLLM != "" {
			result.ForLLM = ScrubCredentials(result.ForLLM)
		}
		if result.ForUser != "" {
			result.ForUser = ScrubCredentials(result.ForUser)
		}
	}

	span.End(result.ForLLM, result.IsError)

	slog.DebugContext(ctx, "tool executed",
		"tool", name,
		"duration_ms", duration.Milliseconds(),
		"is_error", result.IsError,
	)

	return result
}

// isAllowed checks if a tool name is in the allowed list.
func isAllowed(name string, allowed []string) bool {
	for _, a := range allowed {
		if a == name {
			return true
		}
	}
	return false
}
