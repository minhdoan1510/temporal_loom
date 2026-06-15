DELETE FROM casbin_rules
WHERE p_type = 'p'
  AND v0 = 'admin'
  AND v1 = '00000000-0000-0000-0000-000000000001'
  AND v2 IN ('tab:workspace:read', 'tab:workspace:update');
