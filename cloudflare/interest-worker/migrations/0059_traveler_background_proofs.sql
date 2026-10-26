-- Private clearance proof images; replacement retains earlier versions for audit.
CREATE TABLE traveler_background_proofs (
 id TEXT PRIMARY KEY,
 person_id TEXT NOT NULL REFERENCES people(id) ON DELETE CASCADE,
 object_key TEXT NOT NULL UNIQUE,
 filename TEXT NOT NULL,
 media_type TEXT NOT NULL CHECK(media_type IN ('image/jpeg','image/png','image/webp')),
 file_size INTEGER NOT NULL CHECK(file_size>0 AND file_size<=2097152),
 uploaded_by TEXT NOT NULL REFERENCES mmt_users(id),
 created_at TEXT NOT NULL
);
CREATE INDEX traveler_background_proofs_person ON traveler_background_proofs(person_id,created_at DESC);
