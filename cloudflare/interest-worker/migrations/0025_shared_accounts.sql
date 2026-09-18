-- HS remains the identity authority. Financial ownership and historical IDs do not change.
ALTER TABLE mmt_users ADD COLUMN is_org_admin INTEGER NOT NULL DEFAULT 0 CHECK(is_org_admin IN (0,1));
ALTER TABLE mmt_users ADD COLUMN hs_access INTEGER NOT NULL DEFAULT 1 CHECK(hs_access IN (0,1));
ALTER TABLE mmt_users ADD COLUMN csm_access INTEGER NOT NULL DEFAULT 0 CHECK(csm_access IN (0,1));
ALTER TABLE mmt_users ADD COLUMN csm_is_admin INTEGER NOT NULL DEFAULT 0 CHECK(csm_is_admin IN (0,1));
ALTER TABLE mmt_users ADD COLUMN csm_permissions_json TEXT NOT NULL DEFAULT '{}';
UPDATE mmt_users SET is_org_admin=1,csm_access=1,csm_is_admin=1 WHERE id='primary' AND deleted_at IS NULL;
ALTER TABLE admin_sessions ADD COLUMN portal TEXT NOT NULL DEFAULT 'hs' CHECK(portal IN ('hs','csm'));
ALTER TABLE mmt_access_requests ADD COLUMN portal TEXT NOT NULL DEFAULT 'hs' CHECK(portal IN ('hs','csm'));
CREATE INDEX mmt_sessions_user_portal ON admin_sessions(user_id,portal);
CREATE TABLE mmt_switch_codes (
 code_hash TEXT PRIMARY KEY,user_id TEXT NOT NULL REFERENCES mmt_users(id),
 source_session_id TEXT NOT NULL,source TEXT NOT NULL,target TEXT NOT NULL,
 challenge TEXT NOT NULL,expires_at TEXT NOT NULL,consumed_at TEXT,claim TEXT
);
DROP TRIGGER mmt_keep_last_admin;
CREATE TRIGGER mmt_keep_last_org_admin BEFORE UPDATE OF is_org_admin,status,deleted_at ON mmt_users
WHEN OLD.is_org_admin=1 AND OLD.status='active' AND OLD.deleted_at IS NULL
 AND (NEW.is_org_admin=0 OR NEW.status<>'active' OR NEW.deleted_at IS NOT NULL)
 AND NOT EXISTS(SELECT 1 FROM mmt_users WHERE id<>OLD.id AND is_org_admin=1 AND status='active' AND deleted_at IS NULL AND password_hash IS NOT NULL AND (hs_access=1 OR csm_access=1))
BEGIN SELECT RAISE(ABORT,'Keep at least one active organization administrator'); END;
CREATE TRIGGER mmt_keep_org_admin_access BEFORE UPDATE OF hs_access,csm_access ON mmt_users
WHEN OLD.is_org_admin=1 AND OLD.status='active' AND NEW.hs_access=0 AND NEW.csm_access=0
 AND NOT EXISTS(SELECT 1 FROM mmt_users WHERE id<>OLD.id AND is_org_admin=1 AND status='active' AND deleted_at IS NULL AND password_hash IS NOT NULL AND (hs_access=1 OR csm_access=1))
BEGIN SELECT RAISE(ABORT,'Keep at least one active organization administrator with portal access'); END;
