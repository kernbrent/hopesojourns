ALTER TABLE knowledge_sources ADD COLUMN sync_paused INTEGER NOT NULL DEFAULT 0;
UPDATE knowledge_sources SET sync_paused=1 WHERE visibility='private' OR status='withdrawn';
CREATE TABLE knowledge_catalog_state(key TEXT PRIMARY KEY,digest TEXT NOT NULL DEFAULT '',refreshed_at TEXT NOT NULL,lease_until TEXT NOT NULL DEFAULT '');
-- A new upload or public content edit invalidates cached catalog discovery.
CREATE TRIGGER knowledge_new_memory AFTER INSERT ON trip_memories BEGIN DELETE FROM knowledge_catalog_state WHERE key='published'; END;
CREATE TRIGGER knowledge_new_content AFTER INSERT ON trip_content BEGIN DELETE FROM knowledge_catalog_state WHERE key='published'; END;
CREATE TRIGGER knowledge_new_publication AFTER INSERT ON trip_publications BEGIN DELETE FROM knowledge_catalog_state WHERE key='published'; END;
CREATE TRIGGER knowledge_changed_content AFTER UPDATE ON trip_content BEGIN DELETE FROM knowledge_catalog_state WHERE key='published'; END;
CREATE TRIGGER knowledge_changed_memory AFTER UPDATE ON trip_memories BEGIN DELETE FROM knowledge_catalog_state WHERE key='published'; END;
CREATE TRIGGER knowledge_changed_publication AFTER UPDATE ON trip_publications BEGIN DELETE FROM knowledge_catalog_state WHERE key='published'; END;
CREATE TRIGGER knowledge_changed_trip AFTER UPDATE ON trips BEGIN DELETE FROM knowledge_catalog_state WHERE key='published'; END;
CREATE TRIGGER knowledge_changed_destination AFTER UPDATE ON destinations BEGIN DELETE FROM knowledge_catalog_state WHERE key='published'; END;
