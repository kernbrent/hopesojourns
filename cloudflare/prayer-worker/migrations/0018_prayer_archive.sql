ALTER TABLE posts ADD COLUMN archived INTEGER NOT NULL DEFAULT 0 CHECK(archived IN (0,1));
ALTER TABLE posts ADD COLUMN archived_at INTEGER;
ALTER TABLE posts ADD COLUMN archived_by TEXT REFERENCES users(id);
CREATE INDEX posts_archived_created ON posts(archived,created_at);
