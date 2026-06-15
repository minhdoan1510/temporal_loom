-- Workspaces: multi-tenancy. Each workspace independently owns its sessions,
-- skills, context files, knowledge, MCP servers, and roles.

CREATE TABLE IF NOT EXISTS workspaces (
    id          VARCHAR(36)  NOT NULL,
    slug        VARCHAR(64)  NOT NULL,
    name        VARCHAR(255) NOT NULL,
    description VARCHAR(500) NOT NULL DEFAULT '',
    created_by  VARCHAR(255) DEFAULT NULL,
    created_at  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE KEY uq_workspace_slug (slug)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS workspace_members (
    workspace_id VARCHAR(36)  NOT NULL,
    user_sub     VARCHAR(255) NOT NULL,
    added_at     DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (workspace_id, user_sub),
    INDEX idx_ws_members_user (user_sub)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Seed the default workspace. All pre-existing data is backfilled to this id
-- (see 000012) so nothing breaks and CLI/jira channels keep working.
INSERT INTO workspaces (id, slug, name, description)
VALUES ('00000000-0000-0000-0000-000000000001', 'default', 'Default Workspace', 'Default workspace')
ON DUPLICATE KEY UPDATE id = id;
