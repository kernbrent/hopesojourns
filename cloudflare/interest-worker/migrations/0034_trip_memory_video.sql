-- Preserve every memory and the publication guards while widening the kind constraint.
DROP TRIGGER trip_publications_memory_insert;
DROP TRIGGER trip_publications_memory_update;
CREATE TABLE trip_memories_next (
 id TEXT PRIMARY KEY, trip_id TEXT NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
 kind TEXT NOT NULL CHECK(kind IN ('photo','video','note')), title TEXT NOT NULL,
 content TEXT NOT NULL DEFAULT '', event_date TEXT, caption TEXT NOT NULL DEFAULT '',
 alt_text TEXT NOT NULL DEFAULT '', credit TEXT NOT NULL DEFAULT '', object_key TEXT,
 media_type TEXT, byte_size INTEGER, portal_visible INTEGER NOT NULL DEFAULT 0 CHECK(portal_visible IN (0,1)),
 revision INTEGER NOT NULL DEFAULT 1, deleted_at TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL, purge_pending INTEGER NOT NULL DEFAULT 0 CHECK(purge_pending IN (0,1))
);
INSERT INTO trip_memories_next SELECT * FROM trip_memories;
DROP TABLE trip_memories;
ALTER TABLE trip_memories_next RENAME TO trip_memories;
CREATE INDEX trip_memories_trip ON trip_memories(trip_id,deleted_at,event_date);
CREATE TRIGGER trip_publications_memory_insert BEFORE INSERT ON trip_publications
WHEN EXISTS (
 SELECT 1 FROM (SELECT value FROM json_each(NEW.draft_json,'$.memories') UNION ALL SELECT value FROM json_each(NEW.published_json,'$.memories')) selected
 WHERE NOT EXISTS (SELECT 1 FROM trip_memories m WHERE m.id=json_extract(selected.value,'$.id') AND m.trip_id=NEW.trip_id AND m.purge_pending=0)
)
BEGIN SELECT RAISE(ABORT,'TRIP_MEMORY_UNAVAILABLE'); END;
CREATE TRIGGER trip_publications_memory_update BEFORE UPDATE OF draft_json,published_json ON trip_publications
WHEN EXISTS (
 SELECT 1 FROM (SELECT value FROM json_each(NEW.draft_json,'$.memories') UNION ALL SELECT value FROM json_each(NEW.published_json,'$.memories')) selected
 WHERE NOT EXISTS (SELECT 1 FROM trip_memories m WHERE m.id=json_extract(selected.value,'$.id') AND m.trip_id=NEW.trip_id AND m.purge_pending=0)
)
BEGIN SELECT RAISE(ABORT,'TRIP_MEMORY_UNAVAILABLE'); END;
