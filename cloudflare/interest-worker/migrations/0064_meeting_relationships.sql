CREATE TABLE meetings (
 id TEXT PRIMARY KEY, title TEXT NOT NULL, meeting_type TEXT NOT NULL DEFAULT 'Coffee',
 starts_at TEXT NOT NULL, ends_at TEXT NOT NULL, all_day INTEGER NOT NULL DEFAULT 0 CHECK(all_day IN (0,1)),
 timezone TEXT NOT NULL DEFAULT 'America/Chicago', location_name TEXT NOT NULL DEFAULT '', street_address TEXT NOT NULL DEFAULT '',
 notes TEXT NOT NULL DEFAULT '', occurrence_status TEXT NOT NULL DEFAULT 'planned' CHECK(occurrence_status IN ('planned','held','canceled','not_held')),
 follow_up TEXT NOT NULL DEFAULT 'open' CHECK(follow_up IN ('open','closed')), archived INTEGER NOT NULL DEFAULT 0 CHECK(archived IN (0,1)),
 revision INTEGER NOT NULL DEFAULT 1, created_by TEXT NOT NULL REFERENCES mmt_users(id), created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
 calendar_id TEXT, event_id TEXT, occurrence_id TEXT, source_url TEXT NOT NULL DEFAULT '', source_snapshot TEXT, source_review TEXT,
 UNIQUE(calendar_id,event_id,occurrence_id)
);
CREATE INDEX meetings_date ON meetings(archived,starts_at);
CREATE TABLE meeting_participants (
 meeting_id TEXT NOT NULL REFERENCES meetings(id) ON DELETE RESTRICT,
 person_id TEXT REFERENCES people(id) ON DELETE RESTRICT, ministry_id TEXT REFERENCES ministries(id) ON DELETE RESTRICT,
 CHECK((person_id IS NOT NULL)+(ministry_id IS NOT NULL)=1)
);
CREATE UNIQUE INDEX meeting_participant_person ON meeting_participants(meeting_id,person_id) WHERE person_id IS NOT NULL;
CREATE UNIQUE INDEX meeting_participant_ministry ON meeting_participants(meeting_id,ministry_id) WHERE ministry_id IS NOT NULL;
CREATE TABLE meeting_introductions (
 id TEXT PRIMARY KEY, meeting_id TEXT NOT NULL REFERENCES meetings(id) ON DELETE RESTRICT,
 introducers_json TEXT NOT NULL, target_json TEXT, pending_name TEXT NOT NULL DEFAULT '',
 status TEXT NOT NULL CHECK(status IN ('promised','made','outreach_pending','connected','closed','canceled')),
 notes TEXT NOT NULL DEFAULT '', promised_date TEXT, made_date TEXT, next_action TEXT NOT NULL DEFAULT '',
 created_at TEXT NOT NULL, updated_at TEXT NOT NULL
);
CREATE TABLE meeting_introduction_entities (
 introduction_id TEXT NOT NULL REFERENCES meeting_introductions(id) ON DELETE RESTRICT,
 role TEXT NOT NULL CHECK(role IN ('introducer','target')),
 person_id TEXT REFERENCES people(id) ON DELETE RESTRICT, ministry_id TEXT REFERENCES ministries(id) ON DELETE RESTRICT,
 CHECK((person_id IS NOT NULL)+(ministry_id IS NOT NULL)=1)
);
ALTER TABLE ministry_tasks ADD COLUMN meeting_id TEXT REFERENCES meetings(id) ON DELETE RESTRICT;
ALTER TABLE ministry_tasks ADD COLUMN introduction_id TEXT REFERENCES meeting_introductions(id) ON DELETE RESTRICT;
ALTER TABLE ministry_tasks ADD COLUMN ministry_id TEXT REFERENCES ministries(id) ON DELETE RESTRICT;
ALTER TABLE ministry_tasks ADD COLUMN direction TEXT NOT NULL DEFAULT 'mine' CHECK(direction IN ('mine','waiting'));
ALTER TABLE ministry_tasks ADD COLUMN task_kind TEXT NOT NULL DEFAULT 'action' CHECK(task_kind IN ('action','contact_details'));
ALTER TABLE ministry_tasks ADD COLUMN responsible_name TEXT NOT NULL DEFAULT '';
CREATE INDEX ministry_tasks_meeting ON ministry_tasks(meeting_id,status);
CREATE TABLE meeting_contact_keys (client_key TEXT PRIMARY KEY, person_id TEXT NOT NULL UNIQUE REFERENCES people(id) ON DELETE RESTRICT);
CREATE UNIQUE INDEX meeting_contact_reminder ON ministry_tasks(person_id) WHERE task_kind='contact_details';
CREATE TABLE meeting_operations (id TEXT PRIMARY KEY, meeting_id TEXT NOT NULL REFERENCES meetings(id), fingerprint TEXT NOT NULL);
CREATE TABLE meeting_save_guard (id TEXT PRIMARY KEY, valid INTEGER NOT NULL CHECK(valid=1));
CREATE TRIGGER meeting_task_keep_contact BEFORE DELETE ON people WHEN EXISTS(SELECT 1 FROM ministry_tasks WHERE person_id=OLD.id AND meeting_id IS NOT NULL) BEGIN SELECT RAISE(ABORT,'Contact has meeting task history'); END;
