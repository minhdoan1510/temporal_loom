DROP TABLE IF EXISTS casbin_rules;

CREATE TABLE casbin_rules (
    id     BIGINT       NOT NULL AUTO_INCREMENT,
    p_type VARCHAR(100) NOT NULL DEFAULT '',
    v0     VARCHAR(100) NOT NULL DEFAULT '',
    v1     VARCHAR(100) NOT NULL DEFAULT '',
    v2     VARCHAR(100) NOT NULL DEFAULT '',
    v3     VARCHAR(100) NOT NULL DEFAULT '',
    v4     VARCHAR(100) NOT NULL DEFAULT '',
    v5     VARCHAR(100) NOT NULL DEFAULT '',
    PRIMARY KEY (id),
    UNIQUE KEY idx_casbin_rule (p_type, v0, v1, v2, v3, v4, v5)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

INSERT INTO lending_agent.casbin_rules (id, p_type, v0, v1, v2, v3, v4, v5) VALUES
  (28, 'g', 'minhdc3', 'admin', '', '', '', ''),
  (1, 'p', 'admin', 'tab:context-files:read', 'access', '', '', ''),
  (2, 'p', 'admin', 'tab:context-files:update', 'access', '', '', ''),
  (3, 'p', 'admin', 'tab:roles:create', 'access', '', '', ''),
  (4, 'p', 'admin', 'tab:roles:delete', 'access', '', '', ''),
  (5, 'p', 'admin', 'tab:roles:read', 'access', '', '', ''),
  (6, 'p', 'admin', 'tab:roles:update', 'access', '', '', ''),
  (7, 'p', 'admin', 'tab:sessions:create', 'access', '', '', ''),
  (8, 'p', 'admin', 'tab:sessions:delete', 'access', '', '', ''),
  (9, 'p', 'admin', 'tab:sessions:read', 'access', '', '', ''),
  (10, 'p', 'admin', 'tab:skills:create', 'access', '', '', ''),
  (11, 'p', 'admin', 'tab:skills:delete', 'access', '', '', ''),
  (12, 'p', 'admin', 'tab:skills:read', 'access', '', '', ''),
  (13, 'p', 'admin', 'tab:skills:update', 'access', '', '', ''),
  (14, 'p', 'admin', 'tab:traces:read', 'access', '', '', ''),
  (15, 'p', 'admin', 'tool:comment_jira', 'access', '', '', ''),
  (16, 'p', 'admin', 'tool:get_customer_loans', 'access', '', '', ''),
  (17, 'p', 'admin', 'tool:get_jira_comments', 'access', '', '', ''),
  (18, 'p', 'admin', 'tool:get_loan_detail', 'access', '', '', ''),
  (19, 'p', 'admin', 'tool:get_logs_by_trace_id', 'access', '', '', ''),
  (20, 'p', 'admin', 'tool:memory_get', 'access', '', '', ''),
  (21, 'p', 'admin', 'tool:memory_search', 'access', '', '', ''),
  (22, 'p', 'admin', 'tool:memory_set', 'access', '', '', ''),
  (23, 'p', 'admin', 'tool:read_jira_ticket', 'access', '', '', ''),
  (24, 'p', 'admin', 'tool:read_skill', 'access', '', '', ''),
  (25, 'p', 'admin', 'tool:search_http_errors', 'access', '', '', ''),
  (26, 'p', 'admin', 'tool:search_knowledge', 'access', '', '', ''),
  (27, 'p', 'admin', 'tool:skill_search', 'access', '', '', '');