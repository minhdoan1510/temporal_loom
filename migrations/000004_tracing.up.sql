-- Tracing tables for agent run observability

CREATE TABLE IF NOT EXISTS traces (
    id                  VARCHAR(36) NOT NULL,
    session_key         VARCHAR(255) NOT NULL,
    run_id              VARCHAR(36) NOT NULL,
    channel             VARCHAR(50) NOT NULL DEFAULT '',
    user_id             VARCHAR(255) NOT NULL DEFAULT '',
    input_preview       TEXT,
    output_preview      TEXT,
    status              ENUM('running', 'completed', 'failed') NOT NULL DEFAULT 'running',
    error               TEXT,
    total_input_tokens  INT NOT NULL DEFAULT 0,
    total_output_tokens INT NOT NULL DEFAULT 0,
    tool_call_count     INT NOT NULL DEFAULT 0,
    duration_ms         BIGINT NOT NULL DEFAULT 0,
    created_at          TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    INDEX idx_traces_session (session_key),
    INDEX idx_traces_created (created_at DESC),
    INDEX idx_traces_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS spans (
    id            VARCHAR(36) NOT NULL,
    trace_id      VARCHAR(36) NOT NULL,
    span_type     ENUM('llm_call', 'tool_call') NOT NULL,
    name          VARCHAR(255) NOT NULL DEFAULT '',
    status        VARCHAR(50) NOT NULL DEFAULT '',
    error         TEXT,
    input_tokens  INT NOT NULL DEFAULT 0,
    output_tokens INT NOT NULL DEFAULT 0,
    tool_name     VARCHAR(255),
    tool_call_id  VARCHAR(255),
    duration_ms   BIGINT NOT NULL DEFAULT 0,
    created_at    TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    INDEX idx_spans_trace (trace_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
