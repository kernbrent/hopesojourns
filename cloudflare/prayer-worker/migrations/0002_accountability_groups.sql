CREATE TABLE groups (
 id TEXT PRIMARY KEY, name TEXT NOT NULL, description TEXT NOT NULL,
 category TEXT NOT NULL CHECK(category IN ('accountability','prayer','partners','other')),
 discoverable INTEGER NOT NULL CHECK(discoverable IN (0,1)),
 owner_id TEXT NOT NULL REFERENCES users(id), created_at INTEGER NOT NULL
);
CREATE TABLE group_members (
 group_id TEXT NOT NULL REFERENCES groups(id), user_id TEXT NOT NULL REFERENCES users(id),
 status TEXT NOT NULL CHECK(status IN ('invited','pending','approved','declined','removed','left')),
 requested_at INTEGER NOT NULL, decided_at INTEGER, decided_by TEXT REFERENCES users(id),
 requests INTEGER NOT NULL DEFAULT 1 CHECK(requests IN (0,1)),
 updates INTEGER NOT NULL DEFAULT 1 CHECK(updates IN (0,1)),
 answered INTEGER NOT NULL DEFAULT 1 CHECK(answered IN (0,1)),
 PRIMARY KEY(group_id,user_id)
);
CREATE INDEX group_members_user ON group_members(user_id,status);
ALTER TABLE posts ADD COLUMN group_id TEXT REFERENCES groups(id);
CREATE INDEX posts_group ON posts(group_id,created_at);
