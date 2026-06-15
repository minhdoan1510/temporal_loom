package onboarding

import (
	"context"
	"crypto/tls"
	"fmt"
	"strings"
	"time"

	pb "gitlab.zalopay.vn/fin/lending/lending-claw-mcp/api/cashloan_onboard"
	"gitlab.zalopay.vn/fin/lending/lending-claw-mcp/internal/config"

	"google.golang.org/grpc"
	"google.golang.org/grpc/credentials"
	"google.golang.org/grpc/credentials/insecure"
	"google.golang.org/protobuf/types/known/timestamppb"
)

// LoanApplication is a parsed loan application record.
type LoanApplication struct {
	ID                    int64   `json:"id"`
	LoanApplicationID     string  `json:"loan_application_id"`
	ZalopayID             string  `json:"zalopay_id"`
	PartnerCode           string  `json:"partner_code"`
	Status                int32   `json:"status"`
	Code                  int32   `json:"code"`
	CodeMessage           string  `json:"code_message"`
	CurrentStep           string  `json:"current_step"`
	PartnerContractID     string  `json:"partner_contract_id"`
	PartnerContractNumber string  `json:"partner_contract_number"`
	LoanAmount            int64   `json:"loan_amount"`
	LoanTerm              string  `json:"loan_term"`
	LoanInfo              string  `json:"loan_info"`
	ProductCode           string  `json:"product_code"`
	CreatedAt             *string `json:"created_at,omitempty"`
	UpdatedAt             *string `json:"updated_at,omitempty"`
	ApprovedAmount        int64   `json:"approved_amount"`
	ApprovedAt            *string `json:"approved_at,omitempty"`
	ApprovedTerm          string  `json:"approved_term"`
	Validation            string  `json:"validation"`
	SubmitInfoAt          *string `json:"submit_info_at,omitempty"`
	FaceAuthenAt          *string `json:"face_authen_at,omitempty"`
	SignContractAt        *string `json:"sign_contract_at,omitempty"`
	ProductLine           string  `json:"product_line"`
}

// OnboardingClient is a gRPC client for the onboarding service.
type OnboardingClient struct {
	conn    *grpc.ClientConn
	client  pb.OnboardingClient
	address string
}

// grpcAuthMetadata attaches client-id and client-key to every gRPC call.
type grpcAuthMetadata struct {
	clientID  string
	clientKey string
}

func (a *grpcAuthMetadata) GetRequestMetadata(_ context.Context, _ ...string) (map[string]string, error) {
	return map[string]string{
		"client-id":  a.clientID,
		"client-key": a.clientKey,
	}, nil
}

func (a *grpcAuthMetadata) RequireTransportSecurity() bool { return false }

// NewOnboardingClient creates a gRPC client for the onboarding service.
func NewOnboardingClient(cfg config.OnboardingConfig) (*OnboardingClient, error) {
	var opts []grpc.DialOption

	if cfg.GRPCSecure {
		opts = append(opts, grpc.WithTransportCredentials(credentials.NewTLS(&tls.Config{})))
	} else {
		opts = append(opts, grpc.WithTransportCredentials(insecure.NewCredentials()))
	}

	if cfg.ClientID != "" && cfg.ClientKey != "" {
		opts = append(opts, grpc.WithPerRPCCredentials(&grpcAuthMetadata{
			clientID:  cfg.ClientID,
			clientKey: cfg.ClientKey,
		}))
	}

	conn, err := grpc.NewClient(cfg.GRPCAddress, opts...)
	if err != nil {
		return nil, fmt.Errorf("grpc dial %s: %w", cfg.GRPCAddress, err)
	}

	return &OnboardingClient{
		conn:    conn,
		client:  pb.NewOnboardingClient(conn),
		address: cfg.GRPCAddress,
	}, nil
}

// Close closes the gRPC connection.
func (c *OnboardingClient) Close() error {
	if c.conn != nil {
		return c.conn.Close()
	}
	return nil
}

// GetLoanApplicationDetail fetches a single loan application by its ID.
func (c *OnboardingClient) GetLoanApplicationDetail(ctx context.Context, loanApplicationID string) (*LoanApplication, error) {
	resp, err := c.client.GetAllLoanApplications(ctx, &pb.GetAllLoanApplicationsRequest{
		Size:              10,
		LoanApplicationId: &loanApplicationID,
	})
	if err != nil {
		return nil, fmt.Errorf("grpc GetAllLoanApplications: %w", err)
	}

	if len(resp.Data) == 0 {
		return nil, fmt.Errorf("loan application %s not found", loanApplicationID)
	}

	return parseLoanApplication(resp.Data[0]), nil
}

// GetCustomerLoans fetches all loan applications for a given Zalopay user ID.
func (c *OnboardingClient) GetCustomerLoans(ctx context.Context, zalopayID string) ([]LoanApplication, error) {
	resp, err := c.client.GetAllLoanApplications(ctx, &pb.GetAllLoanApplicationsRequest{
		Size:      100,
		ZalopayId: &zalopayID,
	})
	if err != nil {
		return nil, fmt.Errorf("grpc GetAllLoanApplications: %w", err)
	}

	var loans []LoanApplication
	for _, item := range resp.Data {
		loans = append(loans, *parseLoanApplication(item))
	}
	return loans, nil
}

func parseLoanApplication(item *pb.GetAllLoanApplicationItem) *LoanApplication {
	app := &LoanApplication{
		ID:                    item.Id,
		LoanApplicationID:     item.LoanApplicationId,
		ZalopayID:             item.ZalopayId,
		PartnerCode:           item.PartnerCode,
		Status:                item.Status,
		Code:                  item.Code,
		CodeMessage:           item.CodeMessage,
		CurrentStep:           item.CurrentStep,
		PartnerContractID:     item.PartnerContractId,
		PartnerContractNumber: item.PartnerContractNumber,
		LoanAmount:            item.LoanAmount,
		LoanTerm:              item.LoanTerm,
		LoanInfo:              item.LoanInfo,
		ProductCode:           item.ProductCode,
		ApprovedAmount:        item.ApprovedAmount,
		ApprovedTerm:          item.ApprovedTerm,
		Validation:            item.Validation,
		ProductLine:           item.ProductLine,
	}

	app.CreatedAt = formatTimestamp(item.CreatedAt)
	app.UpdatedAt = formatTimestamp(item.UpdatedAt)
	app.ApprovedAt = formatTimestamp(item.ApprovedAt)
	app.SubmitInfoAt = formatTimestamp(item.SubmitInfoAt)
	app.FaceAuthenAt = formatTimestamp(item.FaceAuthenAt)
	app.SignContractAt = formatTimestamp(item.SignContractAt)

	return app
}

func formatTimestamp(ts *timestamppb.Timestamp) *string {
	if ts == nil {
		return nil
	}
	s := ts.AsTime().Format(time.RFC3339)
	return &s
}

// FormatLoanApplication formats a loan application as readable text for LLM consumption.
func FormatLoanApplication(app *LoanApplication) string {
	var sb strings.Builder
	sb.WriteString(fmt.Sprintf("## Loan Application: %s\n\n", app.LoanApplicationID))
	sb.WriteString(fmt.Sprintf("**Zalopay ID:** %s\n", app.ZalopayID))
	sb.WriteString(fmt.Sprintf("**Partner:** %s\n", app.PartnerCode))
	sb.WriteString(fmt.Sprintf("**Product Code:** %s\n", app.ProductCode))
	sb.WriteString(fmt.Sprintf("**Product Line:** %s\n", app.ProductLine))
	sb.WriteString(fmt.Sprintf("**Status:** %d\n", app.Status))
	sb.WriteString(fmt.Sprintf("**Code:** %d (%s)\n", app.Code, app.CodeMessage))
	sb.WriteString(fmt.Sprintf("**Current Step:** %s\n", app.CurrentStep))
	sb.WriteString(fmt.Sprintf("**Loan Amount:** %d\n", app.LoanAmount))
	sb.WriteString(fmt.Sprintf("**Loan Term:** %s\n", app.LoanTerm))
	sb.WriteString(fmt.Sprintf("**Approved Amount:** %d\n", app.ApprovedAmount))
	sb.WriteString(fmt.Sprintf("**Approved Term:** %s\n", app.ApprovedTerm))
	sb.WriteString(fmt.Sprintf("**Partner Contract ID:** %s\n", app.PartnerContractID))
	sb.WriteString(fmt.Sprintf("**Partner Contract Number:** %s\n", app.PartnerContractNumber))
	sb.WriteString(fmt.Sprintf("**Validation:** %s\n", app.Validation))

	if app.CreatedAt != nil {
		sb.WriteString(fmt.Sprintf("**Created At:** %s\n", *app.CreatedAt))
	}
	if app.UpdatedAt != nil {
		sb.WriteString(fmt.Sprintf("**Updated At:** %s\n", *app.UpdatedAt))
	}
	if app.ApprovedAt != nil {
		sb.WriteString(fmt.Sprintf("**Approved At:** %s\n", *app.ApprovedAt))
	}
	if app.SubmitInfoAt != nil {
		sb.WriteString(fmt.Sprintf("**Submit Info At:** %s\n", *app.SubmitInfoAt))
	}
	if app.FaceAuthenAt != nil {
		sb.WriteString(fmt.Sprintf("**Face Authen At:** %s\n", *app.FaceAuthenAt))
	}
	if app.SignContractAt != nil {
		sb.WriteString(fmt.Sprintf("**Sign Contract At:** %s\n", *app.SignContractAt))
	}

	if app.LoanInfo != "" {
		sb.WriteString(fmt.Sprintf("\n**Loan Info:** %s\n", app.LoanInfo))
	}

	return sb.String()
}

// FormatLoanApplicationList formats multiple loan applications as a summary.
func FormatLoanApplicationList(loans []LoanApplication) string {
	if len(loans) == 0 {
		return "No loan applications found."
	}

	var sb strings.Builder
	sb.WriteString(fmt.Sprintf("Found %d loan application(s):\n\n", len(loans)))

	for i, app := range loans {
		sb.WriteString(fmt.Sprintf("### %d. %s\n", i+1, app.LoanApplicationID))
		sb.WriteString(fmt.Sprintf("- **Partner:** %s | **Product:** %s\n", app.PartnerCode, app.ProductCode))
		sb.WriteString(fmt.Sprintf("- **Status:** %d | **Code:** %d (%s)\n", app.Status, app.Code, app.CodeMessage))
		sb.WriteString(fmt.Sprintf("- **Step:** %s\n", app.CurrentStep))
		sb.WriteString(fmt.Sprintf("- **Amount:** %d | **Term:** %s\n", app.LoanAmount, app.LoanTerm))
		if app.CreatedAt != nil {
			sb.WriteString(fmt.Sprintf("- **Created:** %s\n", *app.CreatedAt))
		}
		sb.WriteString("\n")
	}

	return sb.String()
}
