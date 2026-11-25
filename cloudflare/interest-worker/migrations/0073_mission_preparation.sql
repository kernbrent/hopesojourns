CREATE TABLE mission_preparation_requests (
 id TEXT PRIMARY KEY, request_hash TEXT NOT NULL, email TEXT NOT NULL,
 profile_json TEXT, contact_permission INTEGER NOT NULL DEFAULT 0 CHECK(contact_permission IN (0,1)),
 consent_version TEXT NOT NULL, created_at TEXT NOT NULL, reviewed_at TEXT,
 CHECK(profile_json IS NOT NULL OR contact_permission=0)
);
CREATE INDEX mission_preparation_created ON mission_preparation_requests(created_at);
CREATE TABLE mission_preparation_limits (key TEXT PRIMARY KEY, count INTEGER NOT NULL, expires_at INTEGER NOT NULL);
