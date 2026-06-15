package opensearch

import (
	"github.com/modelcontextprotocol/go-sdk/mcp"

	"gitlab.zalopay.vn/fin/lending/lending-claw-mcp/internal/config"
	opensearchsvc "gitlab.zalopay.vn/fin/lending/lending-claw-mcp/internal/services/opensearch"
	opensearchtools "gitlab.zalopay.vn/fin/lending/lending-claw-mcp/internal/tools/opensearch"
)

func New(cfg config.OpenSearchConfig) *mcp.Server {
	if cfg.Host == "" {
		return nil
	}
	client := opensearchsvc.NewOpenSearchClient(cfg)
	srv := mcp.NewServer(&mcp.Implementation{
		Name:    "lending-claw-opensearch",
		Version: "1.0.0",
	}, nil)
	opensearchtools.Register(srv, client)
	return srv
}
