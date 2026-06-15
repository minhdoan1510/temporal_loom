CREATE TABLE IF NOT EXISTS skill_files (
    id           VARCHAR(36)  NOT NULL,
    workspace_id VARCHAR(36)  NOT NULL,
    skill_id     VARCHAR(36)  NOT NULL,
    path         VARCHAR(500) NOT NULL,
    content      MEDIUMTEXT   NOT NULL,
    created_at   DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at   DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE KEY uq_skill_file (workspace_id, skill_id, path),
    KEY idx_skill_files_skill (workspace_id, skill_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
