-- Existing traveler visibility never grants public access.
ALTER TABLE trip_memories ADD COLUMN public_visible INTEGER NOT NULL DEFAULT 0 CHECK(public_visible IN (0,1));
CREATE INDEX trip_memories_public_feed ON trip_memories(trip_id,public_visible,deleted_at,event_date);
