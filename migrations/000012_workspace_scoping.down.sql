-- Reverse workspace_id scoping.

ALTER TABLE mcp_functions
    DROP PRIMARY KEY,
    ADD PRIMARY KEY (server_name, name);
ALTER TABLE mcp_functions DROP COLUMN workspace_id;

ALTER TABLE mcp_servers
    DROP PRIMARY KEY,
    ADD PRIMARY KEY (name);
ALTER TABLE mcp_servers DROP COLUMN workspace_id;

ALTER TABLE knowledge_bases
    DROP INDEX uq_kb_name,
    ADD UNIQUE KEY name (name);
ALTER TABLE knowledge_bases DROP COLUMN workspace_id;

ALTER TABLE traces
    DROP INDEX idx_traces_ws_session,
    DROP INDEX idx_traces_ws_created;
ALTER TABLE traces DROP COLUMN workspace_id;

ALTER TABLE memory_docs
    DROP INDEX uq_memory_doc,
    ADD UNIQUE KEY uq_memory_doc (scope, user_id, path);
ALTER TABLE memory_docs DROP COLUMN workspace_id;

ALTER TABLE skills
    DROP INDEX uq_skill_name,
    ADD UNIQUE KEY uq_skill_name (name);
ALTER TABLE skills DROP COLUMN workspace_id;

ALTER TABLE context_files
    DROP INDEX uq_context_file,
    ADD UNIQUE KEY uq_context_file (scope, user_id, path);
ALTER TABLE context_files DROP COLUMN workspace_id;

ALTER TABLE sessions
    DROP PRIMARY KEY,
    ADD PRIMARY KEY (session_key);
ALTER TABLE sessions DROP COLUMN workspace_id;
