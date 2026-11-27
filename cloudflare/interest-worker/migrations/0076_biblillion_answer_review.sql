CREATE TABLE biblillion_answer_reviews (
 id TEXT PRIMARY KEY, question_id TEXT NOT NULL, answer_key TEXT NOT NULL,
 submitted_answer TEXT NOT NULL, canonical_answer TEXT NOT NULL,
 ai_verdict TEXT NOT NULL CHECK(ai_verdict IN ('valid','invalid','uncertain')),
 ai_points INTEGER NOT NULL, ai_reason TEXT NOT NULL, model TEXT NOT NULL,
 status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','approved','rejected')),
 reviewed_answer TEXT, reviewed_points INTEGER, review_note TEXT NOT NULL DEFAULT '',
 seen_count INTEGER NOT NULL DEFAULT 1, created_at TEXT NOT NULL, last_seen_at TEXT NOT NULL,
 reviewed_at TEXT, reviewed_by TEXT, UNIQUE(question_id,answer_key)
);
CREATE INDEX biblillion_reviews_status ON biblillion_answer_reviews(status,last_seen_at);
-- Immutable scoring receipts preserve earned results when an editor changes future decisions.
CREATE TABLE biblillion_answer_receipts (
 id TEXT PRIMARY KEY, review_id TEXT NOT NULL REFERENCES biblillion_answer_reviews(id),
 question_id TEXT NOT NULL, answer TEXT NOT NULL, points INTEGER NOT NULL,
 note TEXT NOT NULL, created_at TEXT NOT NULL
);
CREATE TABLE biblillion_ai_budget(day TEXT PRIMARY KEY, calls INTEGER NOT NULL DEFAULT 0);
ALTER TABLE biblillion_results ADD COLUMN judgment_id TEXT;
