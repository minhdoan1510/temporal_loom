package jira

import (
	"context"
	"fmt"

	"github.com/modelcontextprotocol/go-sdk/mcp"

	jirasvc "gitlab.zalopay.vn/fin/lending/lending-claw-mcp/internal/services/jira"
)

// NOTE: Hackathon demo build — the Jira tools return canned responses instead of
// calling the real Jira backend so the demo flow is deterministic and offline.

type readTicketArgs struct {
	TicketID string `json:"ticket_id" jsonschema:"The JIRA ticket key (e.g., \"LENDING-123\")"`
}

type commentArgs struct {
	TicketID string `json:"ticket_id" jsonschema:"The JIRA ticket key (e.g., \"LENDING-123\")"`
	Comment  string `json:"comment" jsonschema:"The comment text to add to the ticket"`
}

type getCommentsArgs struct {
	TicketID string `json:"ticket_id" jsonschema:"The JIRA ticket key (e.g., \"LENDING-123\")"`
}

type getTicketsByJQLArgs struct {
	JQL        string `json:"jql" jsonschema:"The JQL query to filter CS tickets (e.g., \"project = LENDING AND status = Open ORDER BY created DESC\")"`
	MaxResults int    `json:"max_results,omitempty" jsonschema:"Maximum number of tickets to return (default: 50)"`
}

type markDoneArgs struct {
	IssueKey      string `json:"issue_key" jsonschema:"The JIRA ticket key (e.g., \"LENDING-123\")"`
	RootCauseType string `json:"root_cause_type" jsonschema:"Root cause classification. Accepts an alias ('communication' or 'external_factors') or a raw customfield_13621 option ID."`
}

// demoTicketBody is the canned description returned by read_jira_ticket.
const demoTicketBody = `**Summary:** [DEMO][Cashloan][Dịch vụ vay tiền nhanh] Khách hàng không tìm thấy hồ sơ vay

**Status:** New
**Type:** Production Issue
**Priority:** P4 (Low)

**Assignee:** Minh. Đoàn Công (3)
**Reporter:** Minh. Đoàn Công (3)

**Labels:** None
**Components:** None

**Created:** 2026-06-16T23:45:47.000+0700
**Updated:** 2026-06-16T23:45:58.000+0700

### Description:
UserID: 260417000009999
 Thời gian: 11:17 ngày 14/06/2026
 Thiết bị:   Mozilla/5.0 (iPhone; CPU iPhone OS 18_7 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 ZaloPayClient/11.6.2 OS/26.2 Platform/ios Secured/true ZaloPayWebClient/11.6.2

Vấn đề:  Kh đăng ký vay SHB hệ thống báo đã có lỗi xảy ra, khách hàng không nhận được OTP, nhờ team kiểm tra nguyên nhân và hxl`

func Register(srv *mcp.Server, client *jirasvc.JiraClient) {
	mcp.AddTool(srv, &mcp.Tool{
		Name:        "read_jira_ticket",
		Description: "Read detailed information from a JIRA ticket including summary, description, status, priority, assignee, labels, and components.",
	}, readTicketHandler(client))

	mcp.AddTool(srv, &mcp.Tool{
		Name:        "comment_jira",
		Description: "Add a comment to a JIRA ticket. Use this to post analysis results, resolution steps, or status updates on tickets.",
	}, commentHandler(client))

	mcp.AddTool(srv, &mcp.Tool{
		Name:        "get_jira_comments",
		Description: "Get all comments on a JIRA ticket. Use this to see the conversation history and previous analysis on a ticket.",
	}, getCommentsHandler(client))

	mcp.AddTool(srv, &mcp.Tool{
		Name:        "get_jira_tickets_by_jql",
		Description: "Search for a list of JIRA CS tickets using a JQL query. Returns a concise list with only the ticket key and title (summary) for each match. Use this to discover which tickets to work on before reading their full details.",
	}, getTicketsByJQLHandler(client))

	mcp.AddTool(srv, &mcp.Tool{
		Name: "mark_done_cs_ticket",
		Description: `Close a CS ticket by driving it through the Acknowledge → Assigned → In Progress → Resolved workflow, attaching root cause + resolution metadata on the final step, and tagging the ticket with the "auto_resolved" label.

CRITICAL: Call this tool ONLY after the underlying issue described in the ticket has actually been investigated and handled (root cause identified, customer informed if needed, fix or explanation delivered). Do NOT call this tool to:
- Tidy up old or stale tickets without resolving them.
- Skip past tickets you don't understand.
- Bulk-close tickets without per-ticket verification.

Calling this on an unresolved ticket leaves the customer issue untouched while marking it Done in Jira — a hard incident. If you are not certain the ticket's underlying work is complete, do not call this tool; ask the user or leave the ticket open.

The tool is idempotent if the ticket is already in Resolved state.`,
	}, markDoneHandler(client))
}

func readTicketHandler(_ *jirasvc.JiraClient) func(ctx context.Context, req *mcp.CallToolRequest, args readTicketArgs) (*mcp.CallToolResult, any, error) {
	return func(ctx context.Context, req *mcp.CallToolRequest, args readTicketArgs) (*mcp.CallToolResult, any, error) {
		return textResult(fmt.Sprintf("## JIRA Ticket: %s\n\n%s", args.TicketID, demoTicketBody)), nil, nil
	}
}

func commentHandler(_ *jirasvc.JiraClient) func(ctx context.Context, req *mcp.CallToolRequest, args commentArgs) (*mcp.CallToolResult, any, error) {
	return func(ctx context.Context, req *mcp.CallToolRequest, args commentArgs) (*mcp.CallToolResult, any, error) {
		return textResult(fmt.Sprintf("Comment added successfully to %s.", args.TicketID)), nil, nil
	}
}

func markDoneHandler(_ *jirasvc.JiraClient) func(ctx context.Context, req *mcp.CallToolRequest, args markDoneArgs) (*mcp.CallToolResult, any, error) {
	return func(ctx context.Context, req *mcp.CallToolRequest, args markDoneArgs) (*mcp.CallToolResult, any, error) {
		return textResult(fmt.Sprintf("Ticket %s transitioned via: Acknowledge → Assigned → In Progress → Resolved. Label 'auto_resolved' applied.", args.IssueKey)), nil, nil
	}
}

func getTicketsByJQLHandler(_ *jirasvc.JiraClient) func(ctx context.Context, req *mcp.CallToolRequest, args getTicketsByJQLArgs) (*mcp.CallToolResult, any, error) {
	return func(ctx context.Context, req *mcp.CallToolRequest, args getTicketsByJQLArgs) (*mcp.CallToolResult, any, error) {
		return textResult(fmt.Sprintf("No tickets found matching JQL: %s", args.JQL)), nil, nil
	}
}

func getCommentsHandler(_ *jirasvc.JiraClient) func(ctx context.Context, req *mcp.CallToolRequest, args getCommentsArgs) (*mcp.CallToolResult, any, error) {
	return func(ctx context.Context, req *mcp.CallToolRequest, args getCommentsArgs) (*mcp.CallToolResult, any, error) {
		return textResult(fmt.Sprintf("No comments found on ticket %s.", args.TicketID)), nil, nil
	}
}

func textResult(text string) *mcp.CallToolResult {
	return &mcp.CallToolResult{
		Content: []mcp.Content{&mcp.TextContent{Text: text}},
	}
}
