-- Add workspace_id scoping to every resource table. The NOT NULL DEFAULT
-- backfills all existing rows to the seeded default workspace (000011).
SET @default_ws := '00000000-0000-0000-0000-000000000001';

-- sessions: PK (session_key) -> (workspace_id, session_key)
ALTER TABLE sessions
    ADD COLUMN workspace_id VARCHAR(36) NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001' AFTER session_key;
ALTER TABLE sessions
    DROP PRIMARY KEY,
    ADD PRIMARY KEY (workspace_id, session_key);

-- context_files: unique (scope, user_id, path) -> (workspace_id, scope, user_id, path)
ALTER TABLE context_files
    ADD COLUMN workspace_id VARCHAR(36) NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001' AFTER id;
ALTER TABLE context_files
    DROP INDEX uq_context_file,
    ADD UNIQUE KEY uq_context_file (workspace_id, scope, user_id, path);

-- skills: unique (name) -> (workspace_id, name)
ALTER TABLE skills
    ADD COLUMN workspace_id VARCHAR(36) NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001' AFTER id;
ALTER TABLE skills
    DROP INDEX uq_skill_name,
    ADD UNIQUE KEY uq_skill_name (workspace_id, name);

-- memory_docs: unique (scope, user_id, path) -> (workspace_id, scope, user_id, path)
ALTER TABLE memory_docs
    ADD COLUMN workspace_id VARCHAR(36) NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001' AFTER id;
ALTER TABLE memory_docs
    DROP INDEX uq_memory_doc,
    ADD UNIQUE KEY uq_memory_doc (workspace_id, scope, user_id, path);

-- traces: add workspace_id + composite index for workspace-scoped listing
ALTER TABLE traces
    ADD COLUMN workspace_id VARCHAR(36) NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001' AFTER id;
ALTER TABLE traces
    ADD INDEX idx_traces_ws_session (workspace_id, session_key),
    ADD INDEX idx_traces_ws_created (workspace_id, created_at DESC);

-- knowledge_bases: unique (name) -> (workspace_id, name)
ALTER TABLE knowledge_bases
    ADD COLUMN workspace_id VARCHAR(36) NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001' AFTER id;
ALTER TABLE knowledge_bases
    DROP INDEX name,
    ADD UNIQUE KEY uq_kb_name (workspace_id, name);

-- mcp_servers: PK (name) -> (workspace_id, name)
ALTER TABLE mcp_servers
    ADD COLUMN workspace_id VARCHAR(36) NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001' FIRST;
ALTER TABLE mcp_servers
    DROP PRIMARY KEY,
    ADD PRIMARY KEY (workspace_id, name);

-- mcp_functions: PK (server_name, name) -> (workspace_id, server_name, name)
ALTER TABLE mcp_functions
    ADD COLUMN workspace_id VARCHAR(36) NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001' FIRST;
ALTER TABLE mcp_functions
    DROP PRIMARY KEY,
    ADD PRIMARY KEY (workspace_id, server_name, name);
