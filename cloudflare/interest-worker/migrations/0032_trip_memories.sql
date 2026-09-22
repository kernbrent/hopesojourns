CREATE TABLE trip_memories (
 id TEXT PRIMARY KEY, trip_id TEXT NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
 kind TEXT NOT NULL CHECK(kind IN ('photo','note')), title TEXT NOT NULL,
 content TEXT NOT NULL DEFAULT '', event_date TEXT, caption TEXT NOT NULL DEFAULT '',
 alt_text TEXT NOT NULL DEFAULT '', credit TEXT NOT NULL DEFAULT '', object_key TEXT,
 media_type TEXT, byte_size INTEGER, portal_visible INTEGER NOT NULL DEFAULT 0 CHECK(portal_visible IN (0,1)),
 revision INTEGER NOT NULL DEFAULT 1, deleted_at TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL
);
CREATE INDEX trip_memories_trip ON trip_memories(trip_id,deleted_at,event_date);
CREATE TABLE trip_publications (
 trip_id TEXT PRIMARY KEY REFERENCES trips(id) ON DELETE CASCADE,
 destination_id TEXT REFERENCES destinations(id), revision INTEGER NOT NULL DEFAULT 0,
 draft_json TEXT, published_json TEXT, published_at TEXT, updated_at TEXT NOT NULL
);
