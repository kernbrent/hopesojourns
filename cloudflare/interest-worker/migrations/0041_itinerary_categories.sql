-- Additive migration: existing content, IDs, devotional links and travel fields stay intact.
ALTER TABLE trip_content ADD COLUMN itinerary_category TEXT NOT NULL DEFAULT 'daily';
ALTER TABLE trip_content ADD COLUMN itinerary_tags TEXT NOT NULL DEFAULT '[]';
ALTER TABLE trip_content ADD COLUMN itinerary_details TEXT NOT NULL DEFAULT '{}';
ALTER TABLE trip_content ADD COLUMN itinerary_private TEXT NOT NULL DEFAULT '{}';
ALTER TABLE trip_content ADD COLUMN end_date TEXT;
ALTER TABLE trip_content ADD COLUMN end_time TEXT;
ALTER TABLE trip_content ADD COLUMN ministry_id TEXT REFERENCES ministries(id) ON DELETE SET NULL;
UPDATE trip_content SET itinerary_category='transportation' WHERE itinerary_kind='travel';
CREATE INDEX trip_content_ministry ON trip_content(ministry_id);
