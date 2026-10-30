ALTER TABLE users ADD COLUMN status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active','suspended','deleted'));
ALTER TABLE users ADD COLUMN is_owner INTEGER NOT NULL DEFAULT 0 CHECK(is_owner IN (0,1));
UPDATE users SET is_owner=1 WHERE role='admin' AND email IN (SELECT email FROM initial_admin_setup WHERE used_at IS NOT NULL);
UPDATE invites SET role='member' WHERE used_at IS NULL;
CREATE TABLE password_resets (
 token_hash TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id),
 expires_at INTEGER NOT NULL, used_at INTEGER, created_by TEXT NOT NULL REFERENCES users(id)
);
CREATE TABLE admin_audit (
 id TEXT PRIMARY KEY, actor_id TEXT NOT NULL REFERENCES users(id), action TEXT NOT NULL,
 target_type TEXT NOT NULL, target_id TEXT NOT NULL, reason TEXT NOT NULL, created_at INTEGER NOT NULL
);
CREATE INDEX admin_audit_created ON admin_audit(created_at);
