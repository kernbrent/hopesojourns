ALTER TABLE prayer_attachments ADD COLUMN stored_size INTEGER;
ALTER TABLE prayer_attachments ADD COLUMN storage_encoding TEXT;
UPDATE prayer_attachments SET stored_size=size;
CREATE INDEX attachment_size ON prayer_attachments(stored_size DESC,id);
