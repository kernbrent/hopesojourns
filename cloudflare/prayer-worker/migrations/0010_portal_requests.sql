CREATE TABLE portal_requests (
 id TEXT PRIMARY KEY, kind TEXT NOT NULL CHECK(kind IN ('access','password')),
 email TEXT NOT NULL COLLATE NOCASE, profile TEXT NOT NULL DEFAULT '{}',
 user_id TEXT REFERENCES users(id), status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','approved','declined','completed')),
 created_at INTEGER NOT NULL, reviewed_at INTEGER, reviewed_by TEXT REFERENCES users(id),
 invite_id TEXT REFERENCES invites(id), revision INTEGER NOT NULL DEFAULT 1
);
CREATE UNIQUE INDEX portal_requests_pending ON portal_requests(kind,email COLLATE NOCASE) WHERE status='pending';
CREATE INDEX portal_requests_queue ON portal_requests(status,created_at DESC,id);
