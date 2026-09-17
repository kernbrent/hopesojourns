-- Retain account identity for audit attribution while removing portal access.
ALTER TABLE mmt_users ADD COLUMN deleted_at TEXT;
CREATE TRIGGER mmt_deleted_user_stays_deleted BEFORE UPDATE ON mmt_users
WHEN OLD.deleted_at IS NOT NULL
BEGIN SELECT RAISE(ABORT, 'Deleted users cannot be changed'); END;
