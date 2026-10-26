-- Private contact details and per-departure vetting. No existing traveler or financial data is changed.
CREATE TABLE traveler_profiles (
 person_id TEXT PRIMARY KEY REFERENCES people(id) ON DELETE CASCADE,
 details_json TEXT NOT NULL DEFAULT '{}',
 revision INTEGER NOT NULL DEFAULT 0 CHECK(revision >= 0),
 updated_at TEXT NOT NULL
);
CREATE TABLE traveler_workflows (
 trip_id TEXT NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
 person_id TEXT NOT NULL REFERENCES people(id) ON DELETE CASCADE,
 stage TEXT NOT NULL DEFAULT 'received' CHECK(stage IN ('received','contacted','application','review','approved','confirmed','waitlisted','withdrawn')),
 application_status TEXT NOT NULL DEFAULT 'not_requested' CHECK(application_status IN ('not_requested','requested','submitted','skipped')),
 skip_reason TEXT NOT NULL DEFAULT '',
 owner_note TEXT NOT NULL DEFAULT '',
 background_status TEXT NOT NULL DEFAULT 'not_requested' CHECK(background_status IN ('not_requested','not_needed','requested','in_progress','cleared','needs_review')),
 background_url TEXT NOT NULL DEFAULT '',
 background_note TEXT NOT NULL DEFAULT '',
 background_explanation TEXT NOT NULL DEFAULT '',
 next_follow_up TEXT NOT NULL DEFAULT '',
 revision INTEGER NOT NULL DEFAULT 0 CHECK(revision >= 0),
 updated_at TEXT NOT NULL,
 PRIMARY KEY(trip_id,person_id)
);
CREATE TABLE traveler_applications (
 id TEXT PRIMARY KEY,
 trip_id TEXT NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
 person_id TEXT NOT NULL REFERENCES people(id) ON DELETE CASCADE,
 token_hash TEXT NOT NULL UNIQUE,
 expires_at TEXT NOT NULL,
 status TEXT NOT NULL DEFAULT 'open' CHECK(status IN ('open','submitted','revoked')),
 answers_json TEXT,
 submitted_at TEXT,
 created_at TEXT NOT NULL
);
CREATE INDEX traveler_applications_person ON traveler_applications(trip_id,person_id,created_at);
CREATE TABLE traveler_screening_emails (
 id TEXT PRIMARY KEY,
 trip_id TEXT NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
 person_id TEXT NOT NULL REFERENCES people(id) ON DELETE CASCADE,
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
CREATE TABLE traveler_screening_previews (
 id TEXT PRIMARY KEY,
 trip_id TEXT NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
 html TEXT NOT NULL,
 expires_at TEXT NOT NULL
);
