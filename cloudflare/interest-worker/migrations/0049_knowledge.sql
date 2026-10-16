-- Public knowledge is an explicit, reviewed projection. Never index portal records.
CREATE TABLE knowledge_sources (
 id TEXT PRIMARY KEY, origin_key TEXT UNIQUE, title TEXT NOT NULL, url TEXT NOT NULL,
 kind TEXT NOT NULL, context TEXT NOT NULL DEFAULT '', ministry TEXT NOT NULL DEFAULT '',
 destination TEXT NOT NULL DEFAULT '', published_at TEXT, updated_at TEXT NOT NULL,
 status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','approved','withdrawn','transcript_missing')),
 visibility TEXT NOT NULL DEFAULT 'public' CHECK(visibility IN ('public','private')),
 body TEXT NOT NULL DEFAULT '', segments_json TEXT NOT NULL DEFAULT '[]',
 revision INTEGER NOT NULL DEFAULT 1, fingerprint TEXT NOT NULL DEFAULT '',
 managed INTEGER NOT NULL DEFAULT 0, provenance TEXT NOT NULL DEFAULT '', reviewed_by TEXT
);
CREATE VIRTUAL TABLE knowledge_search USING fts5(title,body,context,content='knowledge_sources',content_rowid='rowid',tokenize='porter unicode61');
CREATE TRIGGER knowledge_search_insert AFTER INSERT ON knowledge_sources BEGIN
 INSERT INTO knowledge_search(rowid,title,body,context) VALUES(new.rowid,new.title,new.body,new.context);
END;
CREATE TRIGGER knowledge_search_delete AFTER DELETE ON knowledge_sources BEGIN
 INSERT INTO knowledge_search(knowledge_search,rowid,title,body,context) VALUES('delete',old.rowid,old.title,old.body,old.context);
END;
CREATE TRIGGER knowledge_search_update AFTER UPDATE ON knowledge_sources BEGIN
 INSERT INTO knowledge_search(knowledge_search,rowid,title,body,context) VALUES('delete',old.rowid,old.title,old.body,old.context);
 INSERT INTO knowledge_search(rowid,title,body,context) VALUES(new.rowid,new.title,new.body,new.context);
END;
CREATE TABLE knowledge_topics(id TEXT PRIMARY KEY,label TEXT NOT NULL,aliases TEXT NOT NULL DEFAULT '',created_at TEXT NOT NULL);
CREATE TABLE knowledge_questions(
 id TEXT PRIMARY KEY,owner_hash TEXT NOT NULL,conversation_hash TEXT NOT NULL,
 question TEXT NOT NULL,answer TEXT NOT NULL,context TEXT NOT NULL DEFAULT '',
 topic_id TEXT NOT NULL REFERENCES knowledge_topics(id),evidence_json TEXT NOT NULL DEFAULT '[]',
 helpful INTEGER,comment TEXT NOT NULL DEFAULT '',created_at TEXT NOT NULL
);
CREATE INDEX knowledge_owner ON knowledge_questions(owner_hash,created_at);
CREATE INDEX knowledge_conversation ON knowledge_questions(conversation_hash,created_at);
-- Aggregate events are separate so raw conversations can be deleted after 30 days.
CREATE TABLE knowledge_events(id TEXT PRIMARY KEY,visitor_hash TEXT NOT NULL,topic_id TEXT NOT NULL REFERENCES knowledge_topics(id),created_at TEXT NOT NULL);
CREATE INDEX knowledge_popularity ON knowledge_events(topic_id,created_at,visitor_hash);
CREATE TABLE knowledge_candidates(
 id TEXT PRIMARY KEY,question_id TEXT,question TEXT NOT NULL,answer TEXT NOT NULL,
 topic_id TEXT NOT NULL REFERENCES knowledge_topics(id),evidence_json TEXT NOT NULL DEFAULT '[]',
 status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','reviewed','rejected','follow_up','needs_evidence')),
 reuse_approved INTEGER NOT NULL DEFAULT 0,published INTEGER NOT NULL DEFAULT 0,pinned INTEGER NOT NULL DEFAULT 0,
 privacy_checked INTEGER NOT NULL DEFAULT 0,revision INTEGER NOT NULL DEFAULT 1,
 created_at TEXT NOT NULL,updated_at TEXT NOT NULL,reviewed_by TEXT
);
CREATE INDEX knowledge_candidate_queue ON knowledge_candidates(status,updated_at);
CREATE TABLE knowledge_limits(key TEXT PRIMARY KEY,count INTEGER NOT NULL,expires_at TEXT NOT NULL);
CREATE TABLE knowledge_usage(id TEXT PRIMARY KEY,kind TEXT NOT NULL,units INTEGER NOT NULL,created_at TEXT NOT NULL);
CREATE INDEX knowledge_usage_time ON knowledge_usage(created_at);
-- Editing, withdrawing or deleting evidence immediately revokes downstream approvals.
CREATE TRIGGER knowledge_evidence_changed AFTER UPDATE OF body,segments_json,status,visibility,url ON knowledge_sources
WHEN old.body!=new.body OR old.segments_json!=new.segments_json OR old.status!=new.status OR old.visibility!=new.visibility OR old.url!=new.url BEGIN
 UPDATE knowledge_candidates SET reuse_approved=0,published=0,status='needs_evidence',privacy_checked=0,revision=revision+1,updated_at=new.updated_at
 WHERE EXISTS(SELECT 1 FROM json_each(knowledge_candidates.evidence_json) e WHERE json_extract(e.value,'$.id')=new.id);
END;
CREATE TRIGGER knowledge_evidence_deleted BEFORE DELETE ON knowledge_sources BEGIN
 UPDATE knowledge_candidates SET reuse_approved=0,published=0,status='needs_evidence',privacy_checked=0,revision=revision+1
 WHERE EXISTS(SELECT 1 FROM json_each(knowledge_candidates.evidence_json) e WHERE json_extract(e.value,'$.id')=old.id);
END;

INSERT INTO knowledge_sources(id,origin_key,title,url,kind,context,body,status,provenance,updated_at) VALUES('matching','static:internship:matching','A thoughtful match','/internships/','website','internship matching','We learn about your major, interests, availability, and goals before exploring a fit with a ministry partner.','approved','Published canonical internships page; verified against source on 2026-10-16','2026-10-16T00:00:00Z');

INSERT INTO knowledge_sources(id,origin_key,title,url,kind,context,body,status,provenance,updated_at) VALUES('preparation','static:internship:preparation','Preparation that matters','/internships/','website','internship preparation','Before you leave, we work through expectations, culture, service, travel, communication, and personal safety.','approved','Published canonical internships page; verified against source on 2026-10-16','2026-10-16T00:00:00Z');

INSERT INTO knowledge_sources(id,origin_key,title,url,kind,context,body,status,provenance,updated_at) VALUES('supervision','static:internship:supervision','Support while you serve','/internships/','website','internship supervision','You receive local ministry supervision and a weekly Hope Sojourns check-in for reflection, encouragement, and problem-solving.','approved','Published canonical internships page; verified against source on 2026-10-16','2026-10-16T00:00:00Z');
INSERT OR IGNORE INTO knowledge_topics(id,label,aliases,created_at) VALUES('matching','Finding an internship','internship intern placement application apply skills major','2026-10-16T00:00:00Z');
INSERT OR IGNORE INTO knowledge_topics(id,label,aliases,created_at) VALUES('supervision','Support and supervision','supervision supervisor support mentor prepare preparation','2026-10-16T00:00:00Z');
INSERT OR IGNORE INTO knowledge_topics(id,label,aliases,created_at) VALUES('other','Other questions','','2026-10-16T00:00:00Z');
INSERT INTO knowledge_candidates(id,question,answer,topic_id,evidence_json,status,reuse_approved,published,privacy_checked,reviewed_by,created_at,updated_at) VALUES('starter-matching','How do you match someone with an internship?','We learn about your major, interests, availability, and goals before exploring a fit with a ministry partner.','matching','[{"id": "matching", "revision": 1}]','reviewed',1,1,1,'release-review','2026-10-16T00:00:00Z','2026-10-16T00:00:00Z');
INSERT INTO knowledge_candidates(id,question,answer,topic_id,evidence_json,status,reuse_approved,published,privacy_checked,reviewed_by,created_at,updated_at) VALUES('starter-supervision','What support do interns receive?','You receive local ministry supervision and a weekly Hope Sojourns check-in for reflection, encouragement, and problem-solving.','supervision','[{"id": "supervision", "revision": 1}]','reviewed',1,1,1,'release-review','2026-10-16T00:00:00Z','2026-10-16T00:00:00Z');

CREATE TRIGGER knowledge_invalidate_trip_memories_update AFTER UPDATE ON trip_memories BEGIN
 UPDATE knowledge_sources SET status='pending',revision=revision+1,updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE managed=1 AND (origin_key LIKE 'live:'||(SELECT slug FROM trips WHERE id=old.trip_id)||':%');
END;

CREATE TRIGGER knowledge_invalidate_trip_memories_delete AFTER DELETE ON trip_memories BEGIN
 UPDATE knowledge_sources SET status='pending',revision=revision+1,updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE managed=1 AND (origin_key LIKE 'live:'||(SELECT slug FROM trips WHERE id=old.trip_id)||':%');
END;

CREATE TRIGGER knowledge_invalidate_trip_content_update AFTER UPDATE ON trip_content BEGIN
 UPDATE knowledge_sources SET status='pending',revision=revision+1,updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE managed=1 AND (origin_key LIKE 'live:'||(SELECT slug FROM trips WHERE id=old.trip_id)||':%');
END;

CREATE TRIGGER knowledge_invalidate_trip_content_delete AFTER DELETE ON trip_content BEGIN
 UPDATE knowledge_sources SET status='pending',revision=revision+1,updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE managed=1 AND (origin_key LIKE 'live:'||(SELECT slug FROM trips WHERE id=old.trip_id)||':%');
END;

CREATE TRIGGER knowledge_invalidate_trip_publications_update AFTER UPDATE ON trip_publications BEGIN
 UPDATE knowledge_sources SET status='pending',revision=revision+1,updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE managed=1 AND (origin_key LIKE 'live:'||(SELECT slug FROM trips WHERE id=old.trip_id)||':%' OR origin_key LIKE 'story:'||(SELECT slug FROM trips WHERE id=old.trip_id)||':%');
END;

CREATE TRIGGER knowledge_invalidate_trip_publications_delete AFTER DELETE ON trip_publications BEGIN
 UPDATE knowledge_sources SET status='pending',revision=revision+1,updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE managed=1 AND (origin_key LIKE 'live:'||(SELECT slug FROM trips WHERE id=old.trip_id)||':%' OR origin_key LIKE 'story:'||(SELECT slug FROM trips WHERE id=old.trip_id)||':%');
END;

CREATE TRIGGER knowledge_invalidate_trips_update AFTER UPDATE ON trips BEGIN
 UPDATE knowledge_sources SET status='pending',revision=revision+1,updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE managed=1 AND (origin_key LIKE 'live:'||old.slug||':%' OR origin_key LIKE 'story:'||old.slug||':%');
END;

CREATE TRIGGER knowledge_invalidate_trips_delete AFTER DELETE ON trips BEGIN
 UPDATE knowledge_sources SET status='pending',revision=revision+1,updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE managed=1 AND (origin_key LIKE 'live:'||old.slug||':%' OR origin_key LIKE 'story:'||old.slug||':%');
END;

CREATE TRIGGER knowledge_invalidate_destination AFTER UPDATE ON destinations BEGIN
 UPDATE knowledge_sources SET status='pending',revision=revision+1,updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE managed=1;
END;

INSERT OR IGNORE INTO knowledge_topics(id,label,aliases,created_at) VALUES('matching','Finding an internship','internship intern placement apply application fit skills major','2026-10-16T00:00:00Z');
INSERT OR IGNORE INTO knowledge_topics(id,label,aliases,created_at) VALUES('weekly-life','A typical week','week weekly day daily routine schedule duties work','2026-10-16T00:00:00Z');
INSERT OR IGNORE INTO knowledge_topics(id,label,aliases,created_at) VALUES('language','Language','greek english language speak speaking translation','2026-10-16T00:00:00Z');
INSERT OR IGNORE INTO knowledge_topics(id,label,aliases,created_at) VALUES('bedding','Beds and bedding','bed beds bedding mattress mattresses comfortable comfort sleep','2026-10-16T00:00:00Z');
INSERT OR IGNORE INTO knowledge_topics(id,label,aliases,created_at) VALUES('housing','Housing','housing accommodation room rooms flat apartment staying','2026-10-16T00:00:00Z');
INSERT OR IGNORE INTO knowledge_topics(id,label,aliases,created_at) VALUES('costs','Costs and giving','cost costs price prices fee fees donation giving budget funding money','2026-10-16T00:00:00Z');
INSERT OR IGNORE INTO knowledge_topics(id,label,aliases,created_at) VALUES('credit','College credit','college university credit academic accreditation','2026-10-16T00:00:00Z');
INSERT OR IGNORE INTO knowledge_topics(id,label,aliases,created_at) VALUES('availability','Dates and availability','dates available availability timing duration when','2026-10-16T00:00:00Z');
INSERT OR IGNORE INTO knowledge_topics(id,label,aliases,created_at) VALUES('safety','Safety and emergencies','safe safety emergency emergencies insurance security','2026-10-16T00:00:00Z');
INSERT OR IGNORE INTO knowledge_topics(id,label,aliases,created_at) VALUES('supervision','Support and supervision','support supervision supervisor mentor preparation prepare orientation','2026-10-16T00:00:00Z');
INSERT OR IGNORE INTO knowledge_topics(id,label,aliases,created_at) VALUES('ministry','Ministry and service','ministry ministries outreach homeless refugees service serve','2026-10-16T00:00:00Z');
INSERT OR IGNORE INTO knowledge_topics(id,label,aliases,created_at) VALUES('other','Other questions','','2026-10-16T00:00:00Z');