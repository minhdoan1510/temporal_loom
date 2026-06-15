-- Grant the default workspace's admin role the new workspace-settings perms.
-- New workspaces get these via the create handler; this backfills the default
-- workspace (domain = default workspace id) seeded before this permission existed.
INSERT INTO casbin_rules (p_type, v0, v1, v2, v3)
VALUES
  ('p', 'admin', '00000000-0000-0000-0000-000000000001', 'tab:workspace:read', 'access'),
  ('p', 'admin', '00000000-0000-0000-0000-000000000001', 'tab:workspace:update', 'access')
ON DUPLICATE KEY UPDATE id = id;
