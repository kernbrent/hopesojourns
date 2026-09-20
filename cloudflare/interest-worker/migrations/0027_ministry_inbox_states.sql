CREATE TABLE ministry_inbox_states (
 item_id TEXT PRIMARY KEY,
 status TEXT NOT NULL CHECK(status IN ('completed','deleted')),
 previous_status TEXT CHECK(previous_status IN ('completed')),
 updated_by TEXT,
 updated_at TEXT NOT NULL
);
