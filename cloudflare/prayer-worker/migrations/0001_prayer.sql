PRAGMA foreign_keys = ON;
CREATE TABLE users (
 id TEXT PRIMARY KEY, email TEXT NOT NULL UNIQUE COLLATE NOCASE, name TEXT NOT NULL,
 password TEXT NOT NULL, role TEXT NOT NULL DEFAULT 'member' CHECK(role IN ('member','admin')),
 created_at INTEGER NOT NULL
);
CREATE TABLE invites (
 id TEXT PRIMARY KEY, email TEXT NOT NULL COLLATE NOCASE, role TEXT NOT NULL CHECK(role IN ('member','admin')),
 token_hash TEXT NOT NULL UNIQUE, expires_at INTEGER NOT NULL, used_at INTEGER,
 created_by TEXT NOT NULL REFERENCES users(id)
);
CREATE TABLE sessions (
 token_hash TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 csrf TEXT NOT NULL, expires_at INTEGER NOT NULL
);
CREATE INDEX sessions_expiry ON sessions(expires_at);
CREATE TABLE posts (
 id TEXT PRIMARY KEY, author_id TEXT NOT NULL REFERENCES users(id), title TEXT NOT NULL, body TEXT NOT NULL,
 kind TEXT NOT NULL CHECK(kind IN ('request','update','answered')),
 audience TEXT NOT NULL CHECK(audience IN ('members','selected','admins')), created_at INTEGER NOT NULL
);
CREATE TABLE recipients (
 post_id TEXT NOT NULL REFERENCES posts(id) ON DELETE CASCADE, user_id TEXT NOT NULL REFERENCES users(id),
 PRIMARY KEY(post_id,user_id)
);
CREATE TABLE follows (
 follower_id TEXT NOT NULL REFERENCES users(id), followed_id TEXT NOT NULL REFERENCES users(id),
 requests INTEGER NOT NULL DEFAULT 1 CHECK(requests IN (0,1)), updates INTEGER NOT NULL DEFAULT 1 CHECK(updates IN (0,1)),
 answered INTEGER NOT NULL DEFAULT 1 CHECK(answered IN (0,1)),
 PRIMARY KEY(follower_id,followed_id), CHECK(follower_id <> followed_id)
);
CREATE TABLE notifications (
 id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id), post_id TEXT NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
 read_at INTEGER, created_at INTEGER NOT NULL, UNIQUE(user_id,post_id)
);
CREATE INDEX notifications_user ON notifications(user_id,created_at);
CREATE INDEX posts_created ON posts(created_at);
CREATE TABLE login_limits (key TEXT PRIMARY KEY, attempts INTEGER NOT NULL, expires_at INTEGER NOT NULL);
