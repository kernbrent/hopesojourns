-- One-use invitation links open a private in-memory application session.
ALTER TABLE traveler_applications ADD COLUMN opened_at TEXT;
ALTER TABLE traveler_applications ADD COLUMN session_token_hash TEXT;
CREATE UNIQUE INDEX traveler_application_session ON traveler_applications(session_token_hash) WHERE session_token_hash IS NOT NULL;
CREATE TABLE traveler_application_emails (
 id TEXT PRIMARY KEY,
 trip_id TEXT NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
 person_id TEXT NOT NULL REFERENCES people(id) ON DELETE CASCADE,
 application_id TEXT NOT NULL REFERENCES traveler_applications(id) ON DELETE CASCADE,
 send_id TEXT NOT NULL,
 request_hash TEXT NOT NULL,
 payload_json TEXT NOT NULL,
 status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','sending','sent','captured','failed','uncertain')),
 attempt_key TEXT NOT NULL,
 started_at TEXT,
 updated_at TEXT NOT NULL,
 sent_at TEXT,
 provider_id TEXT,
 error TEXT,
 UNIQUE(trip_id,person_id,send_id)
);
CREATE TABLE traveler_application_previews (
 id TEXT PRIMARY KEY,
 trip_id TEXT NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
 html TEXT NOT NULL,
 expires_at TEXT NOT NULL
);
