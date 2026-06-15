
INSERT INTO casbin_rules (p_type, v0, v1, v2) VALUES
  ('p', 'admin', 'tool:read_jira_ticket',     'access'),
  ('p', 'admin', 'tool:comment_jira',         'access'),
  ('p', 'admin', 'tool:get_jira_comments',    'access'),
  ('p', 'admin', 'tool:search_http_errors',   'access'),
  ('p', 'admin', 'tool:get_logs_by_trace_id', 'access'),
  ('p', 'admin', 'tool:get_loan_detail',      'access'),
  ('p', 'admin', 'tool:get_customer_loans',   'access');
