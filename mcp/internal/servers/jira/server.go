package jira

import (
	"github.com/modelcontextprotocol/go-sdk/mcp"

	"gitlab.zalopay.vn/fin/lending/lending-claw-mcp/internal/config"
	jiratools "gitlab.zalopay.vn/fin/lending/lending-claw-mcp/internal/tools/jira"
)

// New builds the Jira MCP server. Demo build: the Jira tools are fully mocked
// (see internal/tools/jira), so the server mounts unconditionally with a nil
// client — no JIRA_PERSONAL_TOKEN required and no real Jira backend dependency.
func New(_ config.JiraConfig) *mcp.Server {
	srv := mcp.NewServer(&mcp.Implementation{
		Name:    "lending-claw-jira",
		Version: "1.0.0",
	}, nil)
	jiratools.Register(srv, nil)
	return srv
}
