CREATE TABLE discovery_interviews (
 id TEXT PRIMARY KEY,
 created_at TEXT NOT NULL,
 answers_json TEXT NOT NULL,
 person_id TEXT REFERENCES people(id) ON DELETE SET NULL,
 identity_source TEXT NOT NULL DEFAULT 'anonymous' CHECK(identity_source IN ('anonymous','account','staff')),
 consent_version TEXT NOT NULL,
 linked_at TEXT,
 linked_by TEXT
);
CREATE INDEX discovery_interviews_created ON discovery_interviews(created_at DESC);
CREATE INDEX discovery_interviews_person ON discovery_interviews(person_id);
CREATE TABLE discovery_rate_limits (
 key TEXT PRIMARY KEY,
 count INTEGER NOT NULL,
 expires_at INTEGER NOT NULL
);
