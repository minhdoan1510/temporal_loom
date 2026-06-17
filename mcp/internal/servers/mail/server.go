package mail

import (
	"github.com/modelcontextprotocol/go-sdk/mcp"

	"gitlab.zalopay.vn/fin/lending/lending-claw-mcp/internal/config"
	mailsvc "gitlab.zalopay.vn/fin/lending/lending-claw-mcp/internal/services/mail"
	mailtools "gitlab.zalopay.vn/fin/lending/lending-claw-mcp/internal/tools/mail"
)

func New(cfg config.MailConfig) *mcp.Server {
	if cfg.ResendAPIKey == "" {
		return nil
	}
	client := mailsvc.NewClient(cfg)
	srv := mcp.NewServer(&mcp.Implementation{
		Name:    "lending-claw-mail",
		Version: "1.0.0",
	}, nil)
	mailtools.Register(srv, client)
	return srv
}
