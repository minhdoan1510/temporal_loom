-- Skills and memory tables for lending-claw Phase 1c

CREATE TABLE IF NOT EXISTS skills (
    id          VARCHAR(36) NOT NULL,
    name        VARCHAR(255) NOT NULL,
    description TEXT,
    content     TEXT NOT NULL,
    metadata    JSON,
    created_at  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE KEY uq_skill_name (name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS memory_docs (
    id         VARCHAR(36) NOT NULL,
    scope      ENUM('global', 'user') NOT NULL DEFAULT 'global',
    user_id    VARCHAR(255) DEFAULT NULL,
    path       VARCHAR(255) NOT NULL,
    content    TEXT NOT NULL,
    metadata   JSON,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE KEY uq_memory_doc (scope, user_id, path)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
