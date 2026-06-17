package datawarehouse

import (
	"context"
	"fmt"
	"strings"

	"github.com/modelcontextprotocol/go-sdk/mcp"

	dwsvc "gitlab.zalopay.vn/fin/lending/lending-claw-mcp/internal/services/datawarehouse"
)

type querySQLArgs struct {
	SQL    string `json:"sql" jsonschema:"The SQL SELECT query to run against the data warehouse"`
	Schema string `json:"schema,omitempty" jsonschema:"Optional table/column descriptions or context to ground the result"`
}

// Register wires the data warehouse tools onto the MCP server.
func Register(srv *mcp.Server, client *dwsvc.Client) {
	mcp.AddTool(srv, &mcp.Tool{
		Name: "query_sql",
		Description: "Run a read-only SQL query against the lending data warehouse and return the result set. " +
			"Use standard SQL SELECT syntax. Provide optional `schema` hints (table/column descriptions) " +
			"to ground the results. Returns rows as a Markdown table.",
	}, querySQLHandler(client))
}

func querySQLHandler(client *dwsvc.Client) func(ctx context.Context, req *mcp.CallToolRequest, args querySQLArgs) (*mcp.CallToolResult, any, error) {
	return func(ctx context.Context, req *mcp.CallToolRequest, args querySQLArgs) (*mcp.CallToolResult, any, error) {
		if strings.TrimSpace(args.SQL) == "" {
			return errResult("`sql` is required"), nil, nil
		}
		result, err := client.QuerySQL(ctx, args.SQL, args.Schema)
		if err != nil {
			return errResult(fmt.Sprintf("Error running query: %v", err)), nil, nil
		}
		return textResult(result), nil, nil
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
