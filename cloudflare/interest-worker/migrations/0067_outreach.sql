CREATE TABLE outreach_prospects (
 id TEXT PRIMARY KEY, source_key TEXT UNIQUE, name TEXT NOT NULL,
 kind TEXT NOT NULL DEFAULT 'organization' CHECK(kind IN ('organization','person')),
 stage TEXT NOT NULL DEFAULT 'not_contacted' CHECK(stage IN ('not_contacted','awaiting_response','in_conversation','meeting_scheduled','active_partner','not_interested','follow_up_later')),
 response TEXT NOT NULL DEFAULT 'none' CHECK(response IN ('none','positive','declined')),
 data_json TEXT NOT NULL, next_action TEXT NOT NULL DEFAULT '', due_date TEXT,
 owner_id TEXT REFERENCES mmt_users(id) ON DELETE SET NULL,
 converted_ministry_id TEXT REFERENCES ministries(id), converted_at TEXT,
 revision INTEGER NOT NULL DEFAULT 1, created_at TEXT NOT NULL, updated_at TEXT NOT NULL
);
CREATE INDEX outreach_due ON outreach_prospects(stage,due_date);
CREATE TABLE outreach_people (
 id TEXT PRIMARY KEY, prospect_id TEXT NOT NULL REFERENCES outreach_prospects(id) ON DELETE CASCADE,
 name TEXT NOT NULL, role TEXT NOT NULL DEFAULT '', email TEXT NOT NULL DEFAULT '', phone TEXT NOT NULL DEFAULT '',
 person_id TEXT REFERENCES people(id)
);
CREATE INDEX outreach_people_prospect ON outreach_people(prospect_id);
CREATE TABLE outreach_activities (
 id TEXT PRIMARY KEY, prospect_id TEXT NOT NULL REFERENCES outreach_prospects(id) ON DELETE CASCADE,
 source_key TEXT, kind TEXT NOT NULL CHECK(kind IN ('email_sent','email_received','call','meeting','note','conversion')),
 occurred_at TEXT NOT NULL, subject TEXT NOT NULL DEFAULT '', body TEXT NOT NULL DEFAULT '',
 metadata_json TEXT NOT NULL DEFAULT '{}', created_by TEXT REFERENCES mmt_users(id), created_at TEXT NOT NULL,
 UNIQUE(prospect_id,source_key)
);
CREATE INDEX outreach_activity_history ON outreach_activities(prospect_id,occurred_at);
CREATE TABLE ministry_inbox_reads (
 user_id TEXT NOT NULL REFERENCES mmt_users(id) ON DELETE CASCADE, item_id TEXT NOT NULL,
 fingerprint TEXT NOT NULL, read_at TEXT NOT NULL, PRIMARY KEY(user_id,item_id)
);
