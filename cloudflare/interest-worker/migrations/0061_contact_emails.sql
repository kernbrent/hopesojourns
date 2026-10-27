CREATE TABLE contact_emails (
 id TEXT PRIMARY KEY,
 request_hash TEXT NOT NULL,
 payload_json TEXT NOT NULL,
 status TEXT NOT NULL DEFAULT 'queued' CHECK(status IN ('queued','sending','sent','captured','failed','uncertain')),
 attempt_key TEXT NOT NULL,
 started_at TEXT,
 provider_id TEXT,
 error TEXT,
 created_by TEXT NOT NULL,
 created_at TEXT NOT NULL,
 updated_at TEXT NOT NULL,
 sent_at TEXT
);
CREATE UNIQUE INDEX contact_emails_unresolved ON contact_emails(request_hash) WHERE status IN ('queued','sending','uncertain');
CREATE INDEX contact_emails_recent ON contact_emails(created_at DESC);
CREATE TABLE contact_email_people (
 email_id TEXT NOT NULL REFERENCES contact_emails(id) ON DELETE CASCADE,
 person_id TEXT NOT NULL REFERENCES people(id) ON DELETE CASCADE,
 PRIMARY KEY(email_id,person_id)
);
