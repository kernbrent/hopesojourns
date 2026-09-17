-- Keep historical identities and foreign keys while releasing login identifiers.
ALTER TABLE mmt_users ADD COLUMN deleted_username TEXT;
ALTER TABLE mmt_users ADD COLUMN deleted_email TEXT;
DROP TRIGGER mmt_deleted_user_stays_deleted;
UPDATE mmt_users
SET deleted_username=username, deleted_email=email,
    username='deleted:' || id, email='deleted:' || id
WHERE deleted_at IS NOT NULL;
CREATE TRIGGER mmt_deleted_user_stays_deleted BEFORE UPDATE ON mmt_users
WHEN OLD.deleted_at IS NOT NULL
BEGIN SELECT RAISE(ABORT, 'Deleted users cannot be changed'); END;
