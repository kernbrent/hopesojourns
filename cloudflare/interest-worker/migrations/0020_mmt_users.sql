CREATE TABLE mmt_users (
 id TEXT PRIMARY KEY, username TEXT NOT NULL UNIQUE COLLATE NOCASE,
 first_name TEXT NOT NULL, last_name TEXT NOT NULL, email TEXT NOT NULL UNIQUE COLLATE NOCASE,
 phone TEXT NOT NULL DEFAULT '', country TEXT NOT NULL DEFAULT 'US',
 password_salt TEXT, password_hash TEXT, iterations INTEGER NOT NULL DEFAULT 100000,
 must_change_password INTEGER NOT NULL DEFAULT 1, temporary_expires_at TEXT, temporary_used_at TEXT,
 is_admin INTEGER NOT NULL DEFAULT 0, permissions_json TEXT NOT NULL DEFAULT '{}',
 status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active','disabled')),
 registered_at TEXT NOT NULL, updated_at TEXT NOT NULL, last_login_at TEXT,
 revision INTEGER NOT NULL DEFAULT 1
);
INSERT INTO mmt_users(id,username,first_name,last_name,email,phone,is_admin,must_change_password,registered_at,updated_at)
VALUES('primary','admin','Brent','Kern','kernbrent@gmail.com','9725050171',1,0,strftime('%Y-%m-%dT%H:%M:%fZ','now'),strftime('%Y-%m-%dT%H:%M:%fZ','now'));
UPDATE mmt_users SET password_salt=(SELECT password_salt FROM admin_credentials WHERE id='primary'),password_hash=(SELECT password_hash FROM admin_credentials WHERE id='primary') WHERE id='primary';
ALTER TABLE admin_sessions ADD COLUMN user_id TEXT REFERENCES mmt_users(id);
-- Shared sessions have no attributable user. Require fresh individual sign-in.
DELETE FROM admin_sessions;
ALTER TABLE audit_events ADD COLUMN actor_user_id TEXT REFERENCES mmt_users(id);
CREATE TABLE mmt_access_requests (
 id TEXT PRIMARY KEY, kind TEXT NOT NULL CHECK(kind IN ('access','recovery')),
 first_name TEXT NOT NULL, last_name TEXT NOT NULL, username TEXT NOT NULL,
 email TEXT NOT NULL, phone TEXT NOT NULL, country TEXT NOT NULL DEFAULT 'US',
 message TEXT NOT NULL DEFAULT '', status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','approved','rejected')),
 user_id TEXT REFERENCES mmt_users(id), created_at TEXT NOT NULL, resolved_at TEXT, resolved_by TEXT REFERENCES mmt_users(id)
);
CREATE TABLE mmt_reset_tokens (
 token_hash TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES mmt_users(id),
 purpose TEXT NOT NULL CHECK(purpose IN ('invite','reset')), expires_at TEXT NOT NULL, consumed_at TEXT, redemption_id TEXT, created_at TEXT NOT NULL
);
CREATE TABLE mmt_email_events (
 id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES mmt_users(id), kind TEXT NOT NULL,
 recipient TEXT NOT NULL, status TEXT NOT NULL, created_at TEXT NOT NULL
);
CREATE TABLE mmt_public_limits (key_hash TEXT PRIMARY KEY, count INTEGER NOT NULL, window_start INTEGER NOT NULL);
CREATE TRIGGER mmt_keep_last_admin BEFORE UPDATE OF is_admin,status ON mmt_users
WHEN OLD.is_admin=1 AND OLD.status='active' AND (NEW.is_admin=0 OR NEW.status<>'active')
 AND NOT EXISTS(SELECT 1 FROM mmt_users WHERE id<>OLD.id AND is_admin=1 AND status='active' AND password_hash IS NOT NULL)
BEGIN SELECT RAISE(ABORT,'Keep at least one active administrator'); END;
CREATE TRIGGER mmt_keep_admin_record BEFORE DELETE ON mmt_users
BEGIN SELECT RAISE(ABORT,'Disable users instead of deleting account history'); END;
