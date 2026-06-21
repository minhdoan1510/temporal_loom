package loan

import (
	"context"

	"github.com/modelcontextprotocol/go-sdk/mcp"

	onboardingsvc "gitlab.zalopay.vn/fin/lending/lending-claw-mcp/internal/services/onboarding"
)

// NOTE: Hackathon demo build — the loan tools return canned responses instead of
// calling the real onboarding gRPC backend so the demo flow is deterministic.

type loanDetailArgs struct {
	LoanApplicationID string `json:"loan_application_id" jsonschema:"The loan application ID to look up"`
}

type customerLoansArgs struct {
	UserID string `json:"user_id" jsonschema:"The Zalopay user ID to look up loans for"`
}

const demoCustomerLoans = `Found 1 loan application(s):

### 1. 20260609-8affb51e-7dc6-4505-aa3b-d21e8dcf1ebb
- **Partner:** SHB | **Product:** VPBRE01
- **Status:** 1 | **Code:** 0 (InitApplicationVpbActivity - activity error (type: InitApplicationVpb, scheduledEventID: 11, starte)
- **Step:** FINISH
- **Amount:** 100000000 | **Term:** 6
- **Created:** 2026-06-09T08:57:24Z`

const demoLoanDetail = `## Loan Application: 20260609-8affb51e-7dc6-4505-aa3b-d21e8dcf1ebb

**Zalopay ID:** 260417000009999
**Partner:** SHB
**Product Code:** VPBRE01
**Product Line:** REVOLVING
**Status:** 1
**Code:** 0 (InitApplicationVpbActivity - activity error (type: InitApplicationVpb, scheduledEventID: 11, starte)
**Current Step:** FINISH
**Loan Amount:** 100000000
**Loan Term:** 6
**Approved Amount:** 100000000
**Approved Term:** 6
**Partner Contract ID:** 20b5e10a-3c87-4cae-a9ce-71ef943cda92
**Partner Contract Number:**
**Validation:** [{"name": "KycLevel", "type": "PROFILE_RULE", "status": "PASSED", "metadata": {}}, {"name": "KycAge", "type": "PROFILE_RULE", "status": "PASSED", "metadata": {}}, {"name": "KycBankBinding", "type": "PROFILE_RULE", "status": "PASSED", "metadata": {}}, {"name": "KycProfileAcceptType", "type": "PROFILE_RULE", "status": "PASSED", "metadata": {"id_type": 5, "accept_types": [5, 6]}}, {"name": "KycProfileIDExpired", "type": "PROFILE_RULE", "status": "PASSED", "metadata": {"now_time": "2026-06-09T00:00:00+07:00"}}, {"name": "NfcMissing", "type": "PROFILE_RULE", "status": "PASSED", "metadata": {}}, {"name": "NfcKycIssuedDate", "type": "PROFILE_RULE", "status": "PASSED", "metadata": {}}]
**Created At:** 2026-06-09T08:57:24Z
**Updated At:** 2026-06-16T16:46:08Z
**Approved At:** 2026-06-16T16:00:26Z
**Submit Info At:** 2026-06-09T08:58:39Z
**Face Authen At:** 2026-06-09T08:58:51Z
**Sign Contract At:** 2026-06-16T16:00:48Z

**Loan Info:** {"LoanFee": 0, "Partner": "VPB", "Interest": 65, "LoanTerm": "6", "ScoreBand": "07", "FinalCheck": {"Score": 0, "UserIP": "", "DeviceID": "", "DeviceOs": "", "Metadata": null, "Platform": "", "ScoreBand": "", "UserAgent": "", "AppVersion": "", "ScoreMonth": "", "DeviceModel": "", "MaxLoanTerm": null, "UserSegment": "", "ScoreVersion": "", "UserSegments": null}, "FirstCheck": {"Score": 988, "UserIP": "103.245.252.75", "DeviceID": "23D88675-43B6-4050-B5B5-D0C53EEAEDE0", "DeviceOs": "ios", "Metadata": {"user_band": "Band 1", "estimated_tenor": 12, "customer_segment": "AAU", "monthly_interest": 0.0528, "telco_data_calling_flag": true}, "Platform": "zpa", "ScoreBand": "07", "UserAgent": "Mozilla/5.0 (iPhone; CPU iPhone OS 18_7 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 ZaloPayClient/11.7.0 OS/26.4.2 Platform/ios Secured/true  ZaloPayWebClient/11.7.0", "AppVersion": "11.7.0", "ScoreMonth": "score_month", "DeviceModel": "iPhone18,3", "MaxLoanTerm": 12, "UserSegment": "zalopay_bau", "ScoreVersion": "pre_loan_v4_1", "UserSegments": ["zalopay_bau"]}, "LoanAmount": 100000000, "TotalLimit": 100000000, "ConsentData": {"sso": true, "consent_content": ""}, "ProductCode": "VPBRE01", "ProductLine": 2, "TotalAmount": 119790292, "ApprovedTerm": "", "InsuranceFee": 0, "StartPayDate": "2026-07-09", "ZaloPayScore": "988", "CollectionFee": 0, "ApprovedAmount": 0, "IsRevolvingDisb": false, "MonthlyInterest": "5.42", "ApprovedInterest": 0, "InsurancePartner": null, "ApprovedTotalLimit": 0, "InsuranceRegistered": false, "TotalInterestAmount": 19790292, "ApprovedInsuranceFee": 0, "MonthlyRepaymentAmount": 19965049}`

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

func getLoanDetailHandler(_ *onboardingsvc.OnboardingClient) func(ctx context.Context, req *mcp.CallToolRequest, args loanDetailArgs) (*mcp.CallToolResult, any, error) {
	return func(ctx context.Context, req *mcp.CallToolRequest, args loanDetailArgs) (*mcp.CallToolResult, any, error) {
		return textResult(demoLoanDetail), nil, nil
	}
}

func getCustomerLoansHandler(_ *onboardingsvc.OnboardingClient) func(ctx context.Context, req *mcp.CallToolRequest, args customerLoansArgs) (*mcp.CallToolResult, any, error) {
	return func(ctx context.Context, req *mcp.CallToolRequest, args customerLoansArgs) (*mcp.CallToolResult, any, error) {
		return textResult(demoCustomerLoans), nil, nil
	}
}

func textResult(text string) *mcp.CallToolResult {
	return &mcp.CallToolResult{
		Content: []mcp.Content{&mcp.TextContent{Text: text}},
	}
}
