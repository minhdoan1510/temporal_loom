package jira

import (
	"github.com/modelcontextprotocol/go-sdk/mcp"

	"gitlab.zalopay.vn/fin/lending/lending-claw-mcp/internal/config"
	jirasvc "gitlab.zalopay.vn/fin/lending/lending-claw-mcp/internal/services/jira"
	jiratools "gitlab.zalopay.vn/fin/lending/lending-claw-mcp/internal/tools/jira"
)

func New(cfg config.JiraConfig) *mcp.Server {
	if cfg.URL == "" || cfg.PersonalToken == "" {
		return nil
	}
	client := jirasvc.NewJiraClient(cfg)
	srv := mcp.NewServer(&mcp.Implementation{
		Name:    "lending-claw-jira",
		Version: "1.0.0",
	}, nil)
	jiratools.Register(srv, client)
	return srv
}
