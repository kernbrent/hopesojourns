ALTER TABLE ministry_tasks ADD COLUMN deleted_at TEXT;
CREATE INDEX ministry_tasks_deleted ON ministry_tasks(deleted_at,status);
