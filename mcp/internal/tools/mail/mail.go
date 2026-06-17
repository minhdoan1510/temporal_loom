package mail

import (
	"context"
	"fmt"
	"strings"

	"github.com/modelcontextprotocol/go-sdk/mcp"

	mailsvc "gitlab.zalopay.vn/fin/lending/lending-claw-mcp/internal/services/mail"
)

type sendMailArgs struct {
	To      []string `json:"to" jsonschema:"Recipient email addresses (at least one required)"`
	Subject string   `json:"subject" jsonschema:"Email subject line"`
	Body    string   `json:"body" jsonschema:"Email body. Plain text by default; set is_html=true to send HTML."`
	IsHTML  bool     `json:"is_html,omitempty" jsonschema:"If true, body is treated as HTML; otherwise as plain text (default: false)"`
	Cc      []string `json:"cc,omitempty" jsonschema:"Optional CC recipient email addresses"`
	Bcc     []string `json:"bcc,omitempty" jsonschema:"Optional BCC recipient email addresses"`
}

// Register wires the mail tools onto the MCP server.
func Register(srv *mcp.Server, client *mailsvc.Client) {
	mcp.AddTool(srv, &mcp.Tool{
		Name: "send_mail",
		Description: "Send a transactional email via Resend. " +
			"Provide one or more recipients in `to`, a `subject`, and a `body`. " +
			"Set is_html=true when the body contains HTML markup.",
	}, sendMailHandler(client))
}

func sendMailHandler(client *mailsvc.Client) func(ctx context.Context, req *mcp.CallToolRequest, args sendMailArgs) (*mcp.CallToolResult, any, error) {
	return func(ctx context.Context, req *mcp.CallToolRequest, args sendMailArgs) (*mcp.CallToolResult, any, error) {
		to := cleanList(args.To)
		if len(to) == 0 {
			return errResult("`to` must contain at least one recipient email address"), nil, nil
		}
		if strings.TrimSpace(args.Subject) == "" {
			return errResult("`subject` is required"), nil, nil
		}
		if strings.TrimSpace(args.Body) == "" {
			return errResult("`body` is required"), nil, nil
		}

		params := mailsvc.SendParams{
			To:      to,
			Cc:      cleanList(args.Cc),
			Bcc:     cleanList(args.Bcc),
			Subject: args.Subject,
		}
		if args.IsHTML {
			params.HTML = args.Body
		} else {
			params.Text = args.Body
		}

		id, err := client.Send(ctx, params)
		if err != nil {
			return errResult(fmt.Sprintf("Error sending email: %v", err)), nil, nil
		}
		return textResult(fmt.Sprintf("Email sent successfully to %s (message id: %s)", strings.Join(to, ", "), id)), nil, nil
	}
}

func cleanList(in []string) []string {
	out := make([]string, 0, len(in))
	for _, s := range in {
		if v := strings.TrimSpace(s); v != "" {
			out = append(out, v)
		}
	}
	return out
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
