-- Rejection hides a traveler for one departure while retaining contact and financial history.
ALTER TABLE traveler_workflows ADD COLUMN rejected_at TEXT;
ALTER TABLE traveler_workflows ADD COLUMN rejection_reason TEXT NOT NULL DEFAULT '';
CREATE INDEX traveler_workflows_rejected ON traveler_workflows(trip_id,rejected_at);
CREATE TABLE contact_traveler_review_notes (
 id TEXT PRIMARY KEY,
 person_id TEXT NOT NULL REFERENCES people(id) ON DELETE CASCADE,
 trip_id TEXT REFERENCES trips(id) ON DELETE SET NULL,
 trip_title TEXT NOT NULL,
 reason TEXT NOT NULL CHECK(length(trim(reason)) > 0),
 reviewer_id TEXT NOT NULL,
 reviewer_name TEXT NOT NULL,
 created_at TEXT NOT NULL
);
CREATE INDEX contact_traveler_review_notes_person ON contact_traveler_review_notes(person_id,created_at);
