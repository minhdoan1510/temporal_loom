package opensearch

import (
	"context"
	"fmt"
	"sort"
	"strings"

	"github.com/modelcontextprotocol/go-sdk/mcp"

	opensearchsvc "gitlab.zalopay.vn/fin/lending/lending-claw-mcp/internal/services/opensearch"
)

// supportedAPIMethods is the whitelist of API methods accepted by get_api_info.
// Extend this map as more methods are supported.
var supportedAPIMethods = map[string]string{
	"GetActiveLoan": "Returns the user's outstanding loan balance and due date displayed on the app",
}

type httpErrorsArgs struct {
	UserID     string `json:"user_id" jsonschema:"The user ID (Zalopay ID) to search errors for"`
	EventTime  string `json:"event_time" jsonschema:"The center time for the search window (ISO format, e.g., '2025-01-15T10:30:00')."`
	HoursDelta int    `json:"hours_delta,omitempty" jsonschema:"Hours before and after event_time to search (default: 36)"`
}

type logsByTraceArgs struct {
	TraceID    string `json:"trace_id" jsonschema:"The trace ID to search for"`
	EventTime  string `json:"event_time" jsonschema:"The center time for the search window (ISO format)."`
	HoursDelta int    `json:"hours_delta,omitempty" jsonschema:"Hours before and after event_time to search (default: 36)"`
}

type activityLogArgs struct {
	LoanApplicationID string `json:"loan_application_id" jsonschema:"The loan application ID to search activity-component logs for"`
	EventTime         string `json:"event_time" jsonschema:"The center time for the search window (ISO format)."`
	HoursDelta        int    `json:"hours_delta,omitempty" jsonschema:"Hours before and after event_time to search (default: 36)"`
}

type apiInfoArgs struct {
	Method     string `json:"method" jsonschema:"API method name. Supported: GetActiveLoan"`
	UserID     string `json:"user_id" jsonschema:"The user ID (Zalopay ID) whose API logs to fetch"`
	EventTime  string `json:"event_time" jsonschema:"The center time for the search window (ISO format)."`
	HoursDelta int    `json:"hours_delta,omitempty" jsonschema:"Hours before and after event_time to search (default: 36)"`
}

func Register(srv *mcp.Server, client *opensearchsvc.OpenSearchClient) {
	mcp.AddTool(srv, &mcp.Tool{
		Name: "search_http_errors",
		Description: "Search for HTTP error logs related to a specific user within a time range. " +
			"Use this to investigate error patterns, failed requests, and service issues for a user.",
	}, searchHTTPErrorsHandler(client))

	mcp.AddTool(srv, &mcp.Tool{
		Name: "get_logs_by_trace_id",
		Description: "Retrieve all log entries associated with a specific trace ID. " +
			"Use this to follow the complete request flow across services and identify where failures occurred.",
	}, getLogsByTraceIDHandler(client))

	mcp.AddTool(srv, &mcp.Tool{
		Name: "get_activity_log",
		Description: "Search activity-component logs scoped to a specific loan application. " +
			"Use this when investigating whether a loan-submission flow to a partner failed " +
			"(e.g. user reports submit/hồ sơ errors, partner integration issues). Requires loan_application_id.",
	}, getActivityLogHandler(client))

	mcp.AddTool(srv, &mcp.Tool{
		Name: "get_api_info",
		Description: "Search HTTP logs for a specific API method called for a user " +
			"(filters by method, component http, and user_id). " +
			"Use this when the user reports incorrect or missing data displayed in the app " +
			"and you know which API serves that data. " +
			"Supported methods: GetActiveLoan (outstanding loan balance & due date).",
	}, getAPIInfoHandler(client))
}

func searchHTTPErrorsHandler(client *opensearchsvc.OpenSearchClient) func(ctx context.Context, req *mcp.CallToolRequest, args httpErrorsArgs) (*mcp.CallToolResult, any, error) {
	return func(ctx context.Context, req *mcp.CallToolRequest, args httpErrorsArgs) (*mcp.CallToolResult, any, error) {
		hours := args.HoursDelta
		if hours == 0 {
			hours = 36
		}
		entries, err := client.SearchHTTPErrors(ctx, args.UserID, args.EventTime, hours)
		if err != nil {
			return errResult(fmt.Sprintf("Error searching HTTP errors: %v", err)), nil, nil
		}
		return textResult(opensearchsvc.FormatLogEntries(entries)), nil, nil
	}
}

func getLogsByTraceIDHandler(client *opensearchsvc.OpenSearchClient) func(ctx context.Context, req *mcp.CallToolRequest, args logsByTraceArgs) (*mcp.CallToolResult, any, error) {
	return func(ctx context.Context, req *mcp.CallToolRequest, args logsByTraceArgs) (*mcp.CallToolResult, any, error) {
		hours := args.HoursDelta
		if hours == 0 {
			hours = 36
		}
		entries, err := client.SearchByTraceID(ctx, args.TraceID, args.EventTime, hours)
		if err != nil {
			return errResult(fmt.Sprintf("Error searching logs by trace ID: %v", err)), nil, nil
		}
		return textResult(opensearchsvc.FormatLogEntries(entries)), nil, nil
	}
}

func getActivityLogHandler(client *opensearchsvc.OpenSearchClient) func(ctx context.Context, req *mcp.CallToolRequest, args activityLogArgs) (*mcp.CallToolResult, any, error) {
	return func(ctx context.Context, req *mcp.CallToolRequest, args activityLogArgs) (*mcp.CallToolResult, any, error) {
		if strings.TrimSpace(args.LoanApplicationID) == "" {
			return errResult("loan_application_id is required"), nil, nil
		}
		hours := args.HoursDelta
		if hours == 0 {
			hours = 36
		}
		entries, err := client.SearchActivityLog(ctx, args.LoanApplicationID, args.EventTime, hours)
		if err != nil {
			return errResult(fmt.Sprintf("Error searching activity logs: %v", err)), nil, nil
		}
		return textResult(opensearchsvc.FormatLogEntries(entries)), nil, nil
	}
}

func getAPIInfoHandler(client *opensearchsvc.OpenSearchClient) func(ctx context.Context, req *mcp.CallToolRequest, args apiInfoArgs) (*mcp.CallToolResult, any, error) {
	return func(ctx context.Context, req *mcp.CallToolRequest, args apiInfoArgs) (*mcp.CallToolResult, any, error) {
		if strings.TrimSpace(args.UserID) == "" {
			return errResult("user_id is required"), nil, nil
		}
		if _, ok := supportedAPIMethods[args.Method]; !ok {
			names := make([]string, 0, len(supportedAPIMethods))
			for m := range supportedAPIMethods {
				names = append(names, m)
			}
			sort.Strings(names)
			return errResult(fmt.Sprintf("unsupported method %q. Supported: %s", args.Method, strings.Join(names, ", "))), nil, nil
		}
		hours := args.HoursDelta
		if hours == 0 {
			hours = 36
		}
		entries, err := client.SearchAPIInfo(ctx, args.Method, args.UserID, args.EventTime, hours)
		if err != nil {
			return errResult(fmt.Sprintf("Error searching API logs: %v", err)), nil, nil
		}
		return textResult(opensearchsvc.FormatLogEntries(entries)), nil, nil
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
