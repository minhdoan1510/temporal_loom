package mcp

import (
	"context"
	"encoding/json"
	"strings"

	"github.com/modelcontextprotocol/go-sdk/mcp"

	"gitlab.zalopay.vn/fin/lending/lending-claw/internal/tools"
)

// RemoteTool adapts a tool discovered on an MCP server into the tools.Tool
// interface, so it can be registered side-by-side with platform tools.
//
// It implements tools.PermissionedTool: the RBAC key is
// "mcp:<server-name>:<tool-name>" (not "tool:<tool-name>"), so admins grant
// access per-server.
type RemoteTool struct {
	serverName  string
	conn        *Conn
	toolName    string
	description string
	schema      map[string]any
}

// NewRemoteTool wraps a discovered MCP tool.
func NewRemoteTool(serverName string, conn *Conn, t *mcp.Tool) *RemoteTool {
	schema := schemaToMap(t)
	desc := t.Description
	if desc == "" {
		desc = "MCP tool from server " + serverName
	}
	return &RemoteTool{
		serverName:  serverName,
		conn:        conn,
		toolName:    t.Name,
		description: desc,
		schema:      schema,
	}
}

// NewRemoteToolFromCache builds an adapter from a function row persisted in
// mcp_functions (so the agent doesn't have to hit tools/list on startup).
func NewRemoteToolFromCache(serverName string, conn *Conn, name, description string, schemaJSON json.RawMessage) *RemoteTool {
	schema := map[string]any{}
	if len(schemaJSON) > 0 {
		if err := json.Unmarshal(schemaJSON, &schema); err != nil {
			schema = map[string]any{"type": "object", "properties": map[string]any{}}
		}
	}
	if _, ok := schema["type"]; !ok {
		schema["type"] = "object"
	}
	if _, ok := schema["properties"]; !ok {
		schema["properties"] = map[string]any{}
	}
	if description == "" {
		description = "MCP tool from server " + serverName
	}
	return &RemoteTool{
		serverName:  serverName,
		conn:        conn,
		toolName:    name,
		description: description,
		schema:      schema,
	}
}

func (r *RemoteTool) Name() string        { return r.toolName }
func (r *RemoteTool) Description() string { return r.description }
func (r *RemoteTool) Parameters() map[string]interface{} {
	if r.schema == nil {
		return map[string]interface{}{
			"type":       "object",
			"properties": map[string]interface{}{},
		}
	}
	return r.schema
}

// PermissionKey implements tools.PermissionedTool — MCP tools use
// "mcp:<server>:<func>" instead of the default "tool:<name>".
func (r *RemoteTool) PermissionKey() string {
	return "mcp:" + r.serverName + ":" + r.toolName
}

// ServerName returns the registered MCP server name backing this tool.
func (r *RemoteTool) ServerName() string { return r.serverName }

// Execute forwards the call to the MCP server and flattens text content into
// the existing tools.Result shape used by the agent loop.
func (r *RemoteTool) Execute(ctx context.Context, args map[string]interface{}) *tools.Result {
	out, err := r.conn.CallTool(ctx, r.toolName, args)
	if err != nil {
		return tools.ErrorResult("mcp call failed: " + err.Error())
	}

	var sb strings.Builder
	for _, c := range out.Content {
		if tc, ok := c.(*mcp.TextContent); ok {
			if sb.Len() > 0 {
				sb.WriteString("\n")
			}
			sb.WriteString(tc.Text)
		}
	}
	res := tools.NewResult(sb.String())
	res.IsError = out.IsError
	return res
}

// SchemaJSON returns the tool's input schema as JSON (used when persisting
// discovered functions in the database).
func (r *RemoteTool) SchemaJSON() json.RawMessage {
	if r.schema == nil {
		return json.RawMessage(`{"type":"object","properties":{}}`)
	}
	b, err := json.Marshal(r.schema)
	if err != nil {
		return json.RawMessage(`{"type":"object","properties":{}}`)
	}
	return b
}

// schemaToMap normalizes the tool's InputSchema (which can be any JSON-
// marshalable value per the SDK) into a map for storage/forwarding.
func schemaToMap(t *mcp.Tool) map[string]any {
	if t.InputSchema == nil {
		return map[string]any{"type": "object", "properties": map[string]any{}}
	}
	b, err := json.Marshal(t.InputSchema)
	if err != nil {
		return nil
	}
	var out map[string]any
	if err := json.Unmarshal(b, &out); err != nil {
		return nil
	}
	if _, ok := out["type"]; !ok {
		out["type"] = "object"
	}
	if _, ok := out["properties"]; !ok {
		out["properties"] = map[string]any{}
	}
	return out
}
