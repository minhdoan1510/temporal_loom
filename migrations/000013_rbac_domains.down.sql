-- Revert domain RBAC back to the flat (sub, obj, act) model.

-- Policies: drop the domain at v1, shift resource(v2)->v1, action(v3)->v2.
UPDATE casbin_rules
SET v1 = v2,
    v2 = v3,
    v3 = ''
WHERE p_type = 'p';

-- Groupings: drop the domain at v2.
UPDATE casbin_rules
SET v2 = ''
WHERE p_type = 'g';
