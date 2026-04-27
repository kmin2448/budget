-- 003_fix_permission_check.sql
-- user_permissions.permission CHECK 제약 업데이트
-- library:write, wemeet:write, smallclub:write 권한 추가

ALTER TABLE user_permissions
  DROP CONSTRAINT IF EXISTS user_permissions_permission_check;

ALTER TABLE user_permissions
  ADD CONSTRAINT user_permissions_permission_check
  CHECK (permission IN (
    'dashboard:write',
    'expenditure:write',
    'budget:write',
    'advance:write',
    'card:write',
    'library:write',
    'wemeet:write',
    'smallclub:write'
  ));
