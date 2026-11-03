-- Existing members and prayers retain their permissions.
ALTER TABLE users ADD COLUMN access_level TEXT NOT NULL DEFAULT 'full' CHECK(access_level IN ('full','provisional'));
ALTER TABLE posts ADD COLUMN is_global INTEGER NOT NULL DEFAULT 0 CHECK(is_global IN (0,1) AND (is_global=0 OR (group_id IS NULL AND audience='members')));
CREATE INDEX posts_global_created ON posts(is_global,created_at);
