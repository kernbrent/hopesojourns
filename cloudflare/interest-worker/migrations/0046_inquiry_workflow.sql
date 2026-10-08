-- Inquiry ownership and follow-up remain separate from journey membership.
CREATE TABLE inquiry_workflows (
 submission_id TEXT PRIMARY KEY REFERENCES interest_submissions(id) ON DELETE CASCADE,
 path TEXT NOT NULL DEFAULT 'general' CHECK(path IN ('general','future','journey')),
 future_list TEXT NOT NULL DEFAULT '', preferred_timing TEXT NOT NULL DEFAULT '',
 trip_id TEXT REFERENCES trips(id) ON DELETE SET NULL,
 stage TEXT NOT NULL DEFAULT 'new' CHECK(stage IN ('new','contacted','exploring','invited','closed')),
 owner_id TEXT REFERENCES mmt_users(id) ON DELETE SET NULL,
 due_date TEXT, next_action TEXT NOT NULL DEFAULT 'Review inquiry and contact this person',
 notes TEXT NOT NULL DEFAULT '', close_reason TEXT NOT NULL DEFAULT '',
 revision INTEGER NOT NULL DEFAULT 1, created_at TEXT NOT NULL, updated_at TEXT NOT NULL
);
CREATE INDEX inquiry_followup ON inquiry_workflows(stage,due_date);
CREATE INDEX inquiry_future ON inquiry_workflows(path,future_list);
CREATE TRIGGER inquiry_received AFTER INSERT ON interest_submissions BEGIN
 INSERT INTO inquiry_workflows(submission_id,preferred_timing,owner_id,due_date,created_at,updated_at)
 VALUES(NEW.id,COALESCE(NEW.preferred_timing,''),
 (SELECT id FROM mmt_users WHERE status='active' AND hs_access=1 AND deleted_at IS NULL AND (is_admin=1 OR is_org_admin=1) ORDER BY id='primary' DESC,id LIMIT 1),
 date(NEW.created_at,CASE strftime('%w',NEW.created_at) WHEN '4' THEN '+4 days' WHEN '5' THEN '+4 days' WHEN '6' THEN '+3 days' ELSE '+2 days' END),NEW.created_at,NEW.updated_at);
END;
INSERT INTO inquiry_workflows(submission_id,preferred_timing,stage,due_date,created_at,updated_at)
SELECT s.id,COALESCE(s.preferred_timing,''),CASE WHEN EXISTS(SELECT 1 FROM interests i WHERE i.submission_id=s.id) AND NOT EXISTS(SELECT 1 FROM interests i WHERE i.submission_id=s.id AND i.status!='closed') THEN 'closed' ELSE 'new' END,
 date('now'),s.created_at,s.updated_at FROM interest_submissions s;
UPDATE inquiry_workflows SET path='journey',trip_id=(SELECT t.trip_id FROM trip_interests t WHERE t.submission_id=inquiry_workflows.submission_id LIMIT 1)
WHERE EXISTS(SELECT 1 FROM trip_interests t WHERE t.submission_id=inquiry_workflows.submission_id);
-- Durable delivery record: capture mode and uncertain sends are never reported as delivered.
CREATE TABLE inquiry_emails (
 id TEXT PRIMARY KEY, inquiry_id TEXT NOT NULL,
 kind TEXT NOT NULL CHECK(kind IN ('acknowledgment','reply')),
 payload_json TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'queued' CHECK(status IN ('queued','sending','sent','failed','uncertain','captured')),
 attempt_key TEXT NOT NULL, started_at TEXT, updated_at TEXT NOT NULL,
 provider_id TEXT, error TEXT, sent_at TEXT
);
CREATE INDEX inquiry_email_history ON inquiry_emails(inquiry_id,updated_at);
