-- Keep application review independent of later trip stages such as Waitlisted.
ALTER TABLE traveler_applications ADD COLUMN review_status TEXT NOT NULL DEFAULT 'pending' CHECK(review_status IN ('pending','reviewed','approved'));
ALTER TABLE traveler_applications ADD COLUMN reviewed_at TEXT;
ALTER TABLE traveler_applications ADD COLUMN reviewed_by TEXT REFERENCES mmt_users(id);
UPDATE traveler_applications SET review_status='approved',reviewed_at=(SELECT w.updated_at FROM traveler_workflows w WHERE w.trip_id=traveler_applications.trip_id AND w.person_id=traveler_applications.person_id)
WHERE status='submitted' AND EXISTS(SELECT 1 FROM traveler_workflows w WHERE w.trip_id=traveler_applications.trip_id AND w.person_id=traveler_applications.person_id AND w.stage IN ('approved','confirmed'));
