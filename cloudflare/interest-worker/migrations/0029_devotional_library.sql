CREATE TABLE devotional_library (
 id TEXT PRIMARY KEY, title TEXT NOT NULL, content TEXT NOT NULL, link_url TEXT,
 scripture TEXT NOT NULL DEFAULT '', topics TEXT NOT NULL DEFAULT '',
 source_url TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL, deleted_at TEXT
);
ALTER TABLE trip_content ADD COLUMN devotional_id TEXT REFERENCES devotional_library(id)
 CHECK (devotional_id IS NULL OR content_type = 'devotional');
CREATE INDEX trip_content_devotional ON trip_content(devotional_id);
CREATE TABLE devotional_usage (
 id TEXT PRIMARY KEY, devotional_id TEXT NOT NULL REFERENCES devotional_library(id),
 content_id TEXT UNIQUE REFERENCES trip_content(id) ON DELETE SET NULL,
 trip_id TEXT REFERENCES trips(id) ON DELETE SET NULL,
 trip_title TEXT NOT NULL, trip_code TEXT, event_date TEXT,
 publication_status TEXT NOT NULL, removed_at TEXT, source_url TEXT,
 created_at TEXT NOT NULL, updated_at TEXT NOT NULL
);
CREATE INDEX devotional_usage_master ON devotional_usage(devotional_id, event_date);
CREATE TRIGGER devotional_usage_added AFTER INSERT ON trip_content WHEN NEW.devotional_id IS NOT NULL BEGIN
 INSERT INTO devotional_usage(id,devotional_id,content_id,trip_id,trip_title,trip_code,event_date,publication_status,created_at,updated_at)
 SELECT lower(hex(randomblob(16))),NEW.devotional_id,NEW.id,t.id,t.title,t.code,NEW.event_date,NEW.publication_status,NEW.created_at,NEW.updated_at FROM trips t WHERE t.id=NEW.trip_id;
END;
CREATE TRIGGER devotional_usage_unlinked BEFORE UPDATE ON trip_content
 WHEN OLD.devotional_id IS NOT NULL AND OLD.devotional_id IS NOT NEW.devotional_id BEGIN
 UPDATE devotional_usage SET content_id=NULL,removed_at=NEW.updated_at,updated_at=NEW.updated_at WHERE content_id=OLD.id;
END;
CREATE TRIGGER devotional_usage_changed AFTER UPDATE ON trip_content BEGIN
 UPDATE devotional_usage SET event_date=NEW.event_date, publication_status=NEW.publication_status,
 removed_at=CASE WHEN NEW.devotional_id IS NULL THEN NEW.updated_at ELSE removed_at END,
 updated_at=NEW.updated_at WHERE content_id=NEW.id;
 INSERT INTO devotional_usage(id,devotional_id,content_id,trip_id,trip_title,trip_code,event_date,publication_status,created_at,updated_at)
 SELECT lower(hex(randomblob(16))),NEW.devotional_id,NEW.id,t.id,t.title,t.code,NEW.event_date,NEW.publication_status,NEW.created_at,NEW.updated_at
 FROM trips t WHERE t.id=NEW.trip_id AND NEW.devotional_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM devotional_usage WHERE content_id=NEW.id);
END;
CREATE TRIGGER devotional_usage_removed BEFORE DELETE ON trip_content BEGIN
 UPDATE devotional_usage SET removed_at=strftime('%Y-%m-%dT%H:%M:%fZ','now'),updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE content_id=OLD.id;
END;
