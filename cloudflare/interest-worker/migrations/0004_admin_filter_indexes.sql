CREATE INDEX interest_submissions_created_idx
ON interest_submissions (created_at DESC);

CREATE INDEX people_contact_preference_idx
ON people (contact_preference);

CREATE INDEX interests_person_status_idx
ON interests (person_id, status);

CREATE INDEX submission_replies_submission_status_idx
ON submission_replies (submission_id, delivery_status);

PRAGMA optimize;
