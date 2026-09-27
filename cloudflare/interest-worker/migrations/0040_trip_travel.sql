-- Travel remains an itinerary subtype in storage, preserving existing content IDs
-- and devotional relationships. The API exposes it as the separate travel type.
ALTER TABLE trip_content ADD COLUMN itinerary_kind TEXT NOT NULL DEFAULT 'activity'
  CHECK (itinerary_kind IN ('activity', 'travel'));
ALTER TABLE trip_content ADD COLUMN arrival_date TEXT;
ALTER TABLE trip_content ADD COLUMN arrival_time TEXT;
ALTER TABLE trip_content ADD COLUMN arrival_location TEXT;
ALTER TABLE trip_content ADD COLUMN travel_mode TEXT;
ALTER TABLE trip_content ADD COLUMN service_number TEXT;
CREATE TRIGGER trip_travel_insert BEFORE INSERT ON trip_content
WHEN NEW.itinerary_kind = 'travel' AND (NEW.content_type != 'itinerary' OR NEW.visibility = 'public' OR NEW.event_date IS NULL OR COALESCE(TRIM(NEW.location), '') = '')
BEGIN SELECT RAISE(ABORT, 'Travel requires a departure date and location and cannot be public.'); END;
CREATE TRIGGER trip_travel_update BEFORE UPDATE ON trip_content
WHEN NEW.itinerary_kind = 'travel' AND (NEW.content_type != 'itinerary' OR NEW.visibility = 'public' OR NEW.event_date IS NULL OR COALESCE(TRIM(NEW.location), '') = '')
BEGIN SELECT RAISE(ABORT, 'Travel requires a departure date and location and cannot be public.'); END;
