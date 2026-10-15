-- Additional destination links supplement the trip's existing primary opportunity.
-- Keep one trip, traveler portal, media collection, and published story.
CREATE TABLE trip_destinations (
 trip_id TEXT NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
 destination_id TEXT NOT NULL REFERENCES destinations(id) ON DELETE CASCADE,
 created_at TEXT NOT NULL,
 PRIMARY KEY (trip_id,destination_id)
);
CREATE INDEX trip_destinations_destination ON trip_destinations(destination_id,trip_id);
