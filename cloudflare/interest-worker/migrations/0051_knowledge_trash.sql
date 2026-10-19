ALTER TABLE knowledge_candidates ADD COLUMN trashed_at TEXT;
CREATE INDEX knowledge_candidates_trash ON knowledge_candidates(trashed_at,updated_at);
