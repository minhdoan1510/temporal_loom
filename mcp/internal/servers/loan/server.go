package loan

import (
	"github.com/modelcontextprotocol/go-sdk/mcp"

	"gitlab.zalopay.vn/fin/lending/lending-claw-mcp/internal/config"
	loantools "gitlab.zalopay.vn/fin/lending/lending-claw-mcp/internal/tools/loan"
)

// New builds the loan MCP server. Demo build: the loan tools are fully mocked
// (see internal/tools/loan), so the server mounts unconditionally with a nil
// client — no onboarding gRPC connection required.
func New(_ config.OnboardingConfig) (*mcp.Server, func(), error) {
	srv := mcp.NewServer(&mcp.Implementation{
		Name:    "lending-claw-loan",
		Version: "1.0.0",
	}, nil)
	loantools.Register(srv, nil)
	return srv, func() {}, nil
}
