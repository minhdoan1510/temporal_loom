-- Domain tools moved out of the main app into MCP server endpoints. Stale
-- "tool:<name>" rules are removed; their MCP-namespaced equivalents are
-- added. "tool:search_knowledge" stays (still a platform tool).
DELETE FROM casbin_rules
WHERE p_type = 'p'
  AND v1 IN (
    'tool:read_jira_ticket',
    'tool:comment_jira',
    'tool:get_jira_comments',
    'tool:search_http_errors',
    'tool:get_logs_by_trace_id',
    'tool:get_loan_detail',
    'tool:get_customer_loans'
);