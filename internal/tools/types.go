package tools

import (
	"context"

	"gitlab.zalopay.vn/fin/lending/lending-claw/internal/providers"
)

// Tool is the interface all tools must implement.
type Tool interface {
	Name() string
	Description() string
	Parameters() map[string]interface{}
	Execute(ctx context.Context, args map[string]interface{}) *Result
}

// PermissionedTool is an optional extension of Tool. Tools that come from
// non-default sources (e.g. MCP servers) can return a custom RBAC permission
// key. Tools that do not implement this interface use the default key
// "tool:" + Name().
type PermissionedTool interface {
	PermissionKey() string
}

// PermissionKeyOf returns the RBAC permission key for a tool. Defaults to
// "tool:<name>" unless the tool implements PermissionedTool.
func PermissionKeyOf(t Tool) string {
	if pt, ok := t.(PermissionedTool); ok {
		return pt.PermissionKey()
	}
	return "tool:" + t.Name()
}

// Result is returned by tool execution.
type Result struct {
	ForLLM  string // text sent to the LLM
	ForUser string // optional display text for the user
	IsError bool
	Err     error
}

// NewResult creates a successful result with text for the LLM.
func NewResult(forLLM string) *Result {
	return &Result{ForLLM: forLLM}
}

// ErrorResult creates an error result.
func ErrorResult(msg string) *Result {
	return &Result{ForLLM: msg, IsError: true}
}

// UserResult creates a result with both LLM and user-facing content.
func UserResult(forLLM, forUser string) *Result {
	return &Result{ForLLM: forLLM, ForUser: forUser}
}

// ToProviderDef converts a Tool to a providers.ToolDefinition for LLM APIs.
func ToProviderDef(t Tool) providers.ToolDefinition {
	return providers.ToolDefinition{
		Type: "function",
		Function: providers.ToolFunctionSchema{
			Name:        t.Name(),
			Description: t.Description(),
			Parameters:  t.Parameters(),
		},
	}
}
