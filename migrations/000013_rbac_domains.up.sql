-- Migrate Casbin policies/groupings to the domain (tenant) RBAC model.
-- New model layout:
--   p = role, domain, resource, action   (v0, v1, v2, v3)
--   g = user, role, domain               (v0, v1, v2)
-- The domain is the workspace id (UUID). All existing rules are scoped to the
-- seeded default workspace (see 000011).

-- Policies: shift resource(v1)->v2, action(v2)->v3, insert domain at v1.
UPDATE casbin_rules
SET v3 = v2,
    v2 = v1,
    v1 = '00000000-0000-0000-0000-000000000001'
WHERE p_type = 'p';

-- Groupings: append the domain at v2.
UPDATE casbin_rules
SET v2 = '00000000-0000-0000-0000-000000000001'
WHERE p_type = 'g';
