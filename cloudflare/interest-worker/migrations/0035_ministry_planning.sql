CREATE TABLE ministry_tasks (
 id TEXT PRIMARY KEY, title TEXT NOT NULL, notes TEXT NOT NULL DEFAULT '',
 trip_id TEXT REFERENCES trips(id) ON DELETE CASCADE,
 person_id TEXT REFERENCES people(id) ON DELETE CASCADE,
 owner_id TEXT REFERENCES mmt_users(id) ON DELETE SET NULL,
 due_date TEXT, status TEXT NOT NULL DEFAULT 'open' CHECK(status IN ('open','completed','canceled')),
 revision INTEGER NOT NULL DEFAULT 1, created_at TEXT NOT NULL, updated_at TEXT NOT NULL
);
CREATE INDEX ministry_tasks_due ON ministry_tasks(status,due_date);
CREATE INDEX ministry_tasks_trip ON ministry_tasks(trip_id);
CREATE INDEX ministry_tasks_person ON ministry_tasks(person_id);
CREATE TABLE trip_reviews (
 trip_id TEXT NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
 section TEXT NOT NULL CHECK(section IN ('team','content','logistics','budget')),
 status TEXT NOT NULL CHECK(status IN ('reviewed','not_applicable')),
 fingerprint TEXT NOT NULL, note TEXT NOT NULL DEFAULT '', reviewed_by TEXT NOT NULL, reviewed_at TEXT NOT NULL,
 PRIMARY KEY(trip_id,section)
);
CREATE TABLE trip_templates (
 id TEXT PRIMARY KEY, title TEXT NOT NULL, snapshot TEXT NOT NULL,
 created_at TEXT NOT NULL, updated_at TEXT NOT NULL, archived INTEGER NOT NULL DEFAULT 0
);
