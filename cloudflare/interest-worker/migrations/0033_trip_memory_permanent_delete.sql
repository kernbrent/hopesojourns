-- Lock removed memories while their private files are being permanently deleted.
ALTER TABLE trip_memories ADD COLUMN purge_pending INTEGER NOT NULL DEFAULT 0 CHECK(purge_pending IN (0,1));
-- A saved snapshot cannot reintroduce a missing or permanently deleting memory.
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
