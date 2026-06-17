package datawarehouse

import (
	"github.com/modelcontextprotocol/go-sdk/mcp"

	"gitlab.zalopay.vn/fin/lending/lending-claw-mcp/internal/config"
	dwsvc "gitlab.zalopay.vn/fin/lending/lending-claw-mcp/internal/services/datawarehouse"
	dwtools "gitlab.zalopay.vn/fin/lending/lending-claw-mcp/internal/tools/datawarehouse"
)

// New builds the data warehouse MCP server. The current implementation mocks
// query results via the shared LLM endpoint, so it requires llm.base_url and
// llm.api_key to be configured.
func New(llm config.LLMConfig, dwCfg config.DatawarehouseConfig) *mcp.Server {
	if llm.BaseURL == "" || llm.APIKey == "" {
		return nil
	}
	client := dwsvc.NewClient(llm, dwCfg)
	srv := mcp.NewServer(&mcp.Implementation{
		Name:    "lending-claw-datawarehouse",
		Version: "1.0.0",
	}, nil)
	dwtools.Register(srv, client)
	return srv
}
