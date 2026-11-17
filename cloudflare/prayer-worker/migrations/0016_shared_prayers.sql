ALTER TABLE posts ADD COLUMN author_only INTEGER NOT NULL DEFAULT 0 CHECK(author_only IN (0,1));
ALTER TABLE posts ADD COLUMN revision INTEGER NOT NULL DEFAULT 1;
ALTER TABLE posts ADD COLUMN updated_at INTEGER;
ALTER TABLE posts ADD COLUMN updated_by TEXT REFERENCES users(id);
CREATE TABLE post_revisions (
 post_id TEXT NOT NULL REFERENCES posts(id) ON DELETE CASCADE, revision INTEGER NOT NULL,
 title TEXT NOT NULL, body TEXT NOT NULL, kind TEXT NOT NULL, author_only INTEGER NOT NULL,
 editor_id TEXT NOT NULL REFERENCES users(id), created_at INTEGER NOT NULL,
 PRIMARY KEY(post_id,revision)
);
CREATE TABLE prayer_comments (
 id TEXT PRIMARY KEY, post_id TEXT NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
 author_id TEXT NOT NULL REFERENCES users(id), body TEXT NOT NULL, created_at INTEGER NOT NULL
);
CREATE INDEX prayer_comments_post ON prayer_comments(post_id,created_at,id);
CREATE TABLE comment_hearts (
 comment_id TEXT NOT NULL REFERENCES prayer_comments(id) ON DELETE CASCADE,
 user_id TEXT NOT NULL REFERENCES users(id), created_at INTEGER NOT NULL,
 PRIMARY KEY(comment_id,user_id)
);
CREATE TABLE written_prayers (
 id TEXT PRIMARY KEY, author_id TEXT NOT NULL REFERENCES users(id), title TEXT NOT NULL,
 body TEXT NOT NULL, tags TEXT NOT NULL DEFAULT '[]', status TEXT NOT NULL CHECK(status IN ('published','hidden')),
 revision INTEGER NOT NULL DEFAULT 1, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL
);
CREATE TABLE written_prayer_versions (
 prayer_id TEXT NOT NULL REFERENCES written_prayers(id) ON DELETE CASCADE, revision INTEGER NOT NULL,
 title TEXT NOT NULL, body TEXT NOT NULL, tags TEXT NOT NULL, status TEXT NOT NULL,
 editor_id TEXT NOT NULL REFERENCES users(id), created_at INTEGER NOT NULL,
 PRIMARY KEY(prayer_id,revision)
);
