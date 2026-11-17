CREATE TABLE prayer_attachments (
 id TEXT PRIMARY KEY, post_id TEXT REFERENCES posts(id) ON DELETE CASCADE,
 written_id TEXT REFERENCES written_prayers(id) ON DELETE CASCADE,
 object_key TEXT NOT NULL UNIQUE, filename TEXT NOT NULL, content_type TEXT NOT NULL,
 size INTEGER NOT NULL, is_audio INTEGER NOT NULL DEFAULT 0,
 created_by TEXT NOT NULL REFERENCES users(id), created_at INTEGER NOT NULL,
 CHECK((post_id IS NULL) <> (written_id IS NULL))
);
CREATE INDEX attachment_post ON prayer_attachments(post_id);
CREATE INDEX attachment_written ON prayer_attachments(written_id);
