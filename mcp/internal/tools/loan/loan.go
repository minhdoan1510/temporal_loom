package loan

import (
	"context"
	"fmt"

	"github.com/modelcontextprotocol/go-sdk/mcp"

	onboardingsvc "gitlab.zalopay.vn/fin/lending/lending-claw-mcp/internal/services/onboarding"
)

type loanDetailArgs struct {
	LoanApplicationID string `json:"loan_application_id" jsonschema:"The loan application ID to look up"`
}

type customerLoansArgs struct {
	UserID string `json:"user_id" jsonschema:"The Zalopay user ID to look up loans for"`
}

func Register(srv *mcp.Server, client *onboardingsvc.OnboardingClient) {
	mcp.AddTool(srv, &mcp.Tool{
		Name: "get_loan_detail",
		Description: "Get detailed information about a specific loan application by its loan application ID. " +
			"Returns status, amount, term, partner details, approval info, and all timestamps.",
	}, getLoanDetailHandler(client))

	mcp.AddTool(srv, &mcp.Tool{
		Name: "get_customer_loans",
		Description: "Get all loan applications for a specific customer by their Zalopay user ID. " +
			"Returns a summary list of all loan applications including status, amount, and timestamps.",
	}, getCustomerLoansHandler(client))
}

func getLoanDetailHandler(client *onboardingsvc.OnboardingClient) func(ctx context.Context, req *mcp.CallToolRequest, args loanDetailArgs) (*mcp.CallToolResult, any, error) {
	return func(ctx context.Context, req *mcp.CallToolRequest, args loanDetailArgs) (*mcp.CallToolResult, any, error) {
		app, err := client.GetLoanApplicationDetail(ctx, args.LoanApplicationID)
		if err != nil {
			return errResult(fmt.Sprintf("Error fetching loan application %s: %v", args.LoanApplicationID, err)), nil, nil
		}
		return textResult(onboardingsvc.FormatLoanApplication(app)), nil, nil
	}
}

func getCustomerLoansHandler(client *onboardingsvc.OnboardingClient) func(ctx context.Context, req *mcp.CallToolRequest, args customerLoansArgs) (*mcp.CallToolResult, any, error) {
	return func(ctx context.Context, req *mcp.CallToolRequest, args customerLoansArgs) (*mcp.CallToolResult, any, error) {
		loans, err := client.GetCustomerLoans(ctx, args.UserID)
		if err != nil {
			return errResult(fmt.Sprintf("Error fetching loans for user %s: %v", args.UserID, err)), nil, nil
		}
		return textResult(onboardingsvc.FormatLoanApplicationList(loans)), nil, nil
	}
}

func textResult(text string) *mcp.CallToolResult {
	return &mcp.CallToolResult{
		Content: []mcp.Content{&mcp.TextContent{Text: text}},
	}
}

func errResult(text string) *mcp.CallToolResult {
	return &mcp.CallToolResult{
		IsError: true,
		Content: []mcp.Content{&mcp.TextContent{Text: text}},
	}
}
