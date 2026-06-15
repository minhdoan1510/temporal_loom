-- Platform tables for lending-claw

CREATE TABLE IF NOT EXISTS sessions (
    session_key      VARCHAR(255) NOT NULL,
    history          JSON NOT NULL,
    summary          TEXT,
    metadata         JSON,
    compaction_count INT NOT NULL DEFAULT 0,
    created_at       TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at       TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (session_key),
    INDEX idx_sessions_updated (updated_at DESC)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS context_files (
    id         VARCHAR(36) NOT NULL,
    scope      ENUM('global', 'user') NOT NULL,
    user_id    VARCHAR(255) DEFAULT NULL,
    path       VARCHAR(255) NOT NULL,
    content    TEXT NOT NULL,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE KEY uq_context_file (scope, user_id, path)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
