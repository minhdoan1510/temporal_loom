package loan

import (
	"github.com/modelcontextprotocol/go-sdk/mcp"

	"gitlab.zalopay.vn/fin/lending/lending-claw-mcp/internal/config"
	onboardingsvc "gitlab.zalopay.vn/fin/lending/lending-claw-mcp/internal/services/onboarding"
	loantools "gitlab.zalopay.vn/fin/lending/lending-claw-mcp/internal/tools/loan"
)

func New(cfg config.OnboardingConfig) (*mcp.Server, func(), error) {
	if cfg.GRPCAddress == "" {
		return nil, func() {}, nil
	}
	client, err := onboardingsvc.NewOnboardingClient(cfg)
	if err != nil {
		return nil, func() {}, err
	}
	srv := mcp.NewServer(&mcp.Implementation{
		Name:    "lending-claw-loan",
		Version: "1.0.0",
	}, nil)
	loantools.Register(srv, client)
	cleanup := func() { _ = client.Close() }
	return srv, cleanup, nil
}
