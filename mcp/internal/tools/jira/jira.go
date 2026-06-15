package jira

import (
	"context"
	"fmt"
	"log/slog"
	"strings"

	"github.com/modelcontextprotocol/go-sdk/mcp"

	jirasvc "gitlab.zalopay.vn/fin/lending/lending-claw-mcp/internal/services/jira"
)

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

func readTicketHandler(client *jirasvc.JiraClient) func(ctx context.Context, req *mcp.CallToolRequest, args readTicketArgs) (*mcp.CallToolResult, any, error) {
	return func(ctx context.Context, req *mcp.CallToolRequest, args readTicketArgs) (*mcp.CallToolResult, any, error) {
		ticket, err := client.GetTicket(ctx, args.TicketID)
		if err != nil {
			return errResult(fmt.Sprintf("Error reading ticket %s: %v", args.TicketID, err)), nil, nil
		}
		return textResult(fmt.Sprintf(`## JIRA Ticket: %s

**Summary:** %s

**Status:** %s
**Type:** %s
**Priority:** %s

**Assignee:** %s
**Reporter:** %s

**Labels:** %s
**Components:** %s

**Created:** %s
**Updated:** %s

### Description:
%s`,
			ticket.Key, ticket.Summary, ticket.Status, ticket.IssueType,
			orStr(ticket.Priority, "Not set"),
			orStr(ticket.Assignee, "Unassigned"),
			orStr(ticket.Reporter, "Unknown"),
			joinOrNone(ticket.Labels),
			joinOrNone(ticket.Components),
			ticket.Created, ticket.Updated,
			orStr(ticket.Description, "No description provided"),
		)), nil, nil
	}
}

func commentHandler(client *jirasvc.JiraClient) func(ctx context.Context, req *mcp.CallToolRequest, args commentArgs) (*mcp.CallToolResult, any, error) {
	return func(ctx context.Context, req *mcp.CallToolRequest, args commentArgs) (*mcp.CallToolResult, any, error) {
		comment := addAuthor(args.Comment)
		if err := client.AddComment(ctx, args.TicketID, comment); err != nil {
			return errResult(fmt.Sprintf("Error adding comment to %s: %v", args.TicketID, err)), nil, nil
		}
		if err := client.AddLabels(ctx, args.TicketID, []string{"ai_resolve"}); err != nil {
			slog.WarnContext(ctx, "failed to add ai_resolve label", "ticket", args.TicketID, "error", err)
		}
		return textResult(fmt.Sprintf("Comment added successfully to %s.", args.TicketID)), nil, nil
	}
}

func markDoneHandler(client *jirasvc.JiraClient) func(ctx context.Context, req *mcp.CallToolRequest, args markDoneArgs) (*mcp.CallToolResult, any, error) {
	return func(ctx context.Context, req *mcp.CallToolRequest, args markDoneArgs) (*mcp.CallToolResult, any, error) {
		rootCauseID, ok := jirasvc.LookupRootCauseID(args.RootCauseType)
		if !ok {
			return errResult(fmt.Sprintf("Invalid root_cause_type %q. Accepted: communication, external_factors, or a raw customfield_13621 option ID.", args.RootCauseType)), nil, nil
		}
		applied, err := client.MarkDoneCsTicket(ctx, args.IssueKey, rootCauseID)
		if err != nil {
			return errResult(fmt.Sprintf("Error resolving %s: %v", args.IssueKey, err)), nil, nil
		}
		if err := client.AddLabels(ctx, args.IssueKey, []string{"auto_resolved"}); err != nil {
			slog.WarnContext(ctx, "failed to add auto_resolved label", "ticket", args.IssueKey, "error", err)
		}
		msg := fmt.Sprintf("Ticket %s already Resolved. Label 'auto_resolved' applied.", args.IssueKey)
		if len(applied) > 0 {
			msg = fmt.Sprintf("Ticket %s transitioned via: %s. Label 'auto_resolved' applied.", args.IssueKey, strings.Join(applied, " → "))
		}
		return textResult(msg), nil, nil
	}
}

func getTicketsByJQLHandler(client *jirasvc.JiraClient) func(ctx context.Context, req *mcp.CallToolRequest, args getTicketsByJQLArgs) (*mcp.CallToolResult, any, error) {
	return func(ctx context.Context, req *mcp.CallToolRequest, args getTicketsByJQLArgs) (*mcp.CallToolResult, any, error) {
		tickets, err := client.SearchJQL(ctx, args.JQL, args.MaxResults)
		if err != nil {
			return errResult(fmt.Sprintf("Error searching tickets with JQL %q: %v", args.JQL, err)), nil, nil
		}
		if len(tickets) == 0 {
			return textResult(fmt.Sprintf("No tickets found matching JQL: %s", args.JQL)), nil, nil
		}
		var sb strings.Builder
		sb.WriteString(fmt.Sprintf("## CS Tickets (%d total)\n\n", len(tickets)))
		for _, t := range tickets {
			sb.WriteString(fmt.Sprintf("- %s: %s\n", t.Key, t.Summary))
		}
		return textResult(sb.String()), nil, nil
	}
}

func getCommentsHandler(client *jirasvc.JiraClient) func(ctx context.Context, req *mcp.CallToolRequest, args getCommentsArgs) (*mcp.CallToolResult, any, error) {
	return func(ctx context.Context, req *mcp.CallToolRequest, args getCommentsArgs) (*mcp.CallToolResult, any, error) {
		comments, err := client.GetComments(ctx, args.TicketID)
		if err != nil {
			return errResult(fmt.Sprintf("Error getting comments for %s: %v", args.TicketID, err)), nil, nil
		}
		if len(comments) == 0 {
			return textResult(fmt.Sprintf("No comments found on ticket %s.", args.TicketID)), nil, nil
		}
		var sb strings.Builder
		sb.WriteString(fmt.Sprintf("## Comments on %s (%d total)\n\n", args.TicketID, len(comments)))
		for i, c := range comments {
			sb.WriteString(fmt.Sprintf("### Comment %d\n", i+1))
			sb.WriteString(fmt.Sprintf("**Author:** %s\n", c.Author))
			sb.WriteString(fmt.Sprintf("**Created:** %s\n\n", c.Created))
			sb.WriteString(c.Body)
			sb.WriteString("\n\n")
		}
		return textResult(sb.String()), nil, nil
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

func addAuthor(comment string) string {
	author := "[~minhdc3]"
	feedbackLink := "https://teams.microsoft.com/l/channel/19%3Ae7e55276758144d9a64afb15d9d6568c%40thread.tacv2/%5BCSTool%5D%20Feedback?groupId=c3243a85-2d25-4d79-a072-716fdde7bc98&tenantId=7c112a6e-10e2-4e09-afc4-2e37bc60d821"
	return fmt.Sprintf("(This message is generated by Lending Tool. Please contact %s if there are any issues with the information. For feedback or feature requests, please visit [CSTool Feedback|%s])\n%s", author, feedbackLink, comment)
}

func orStr(s *string, fallback string) string {
	if s == nil || *s == "" {
		return fallback
	}
	return *s
}

func joinOrNone(items []string) string {
	if len(items) == 0 {
		return "None"
	}
	return strings.Join(items, ", ")
}
