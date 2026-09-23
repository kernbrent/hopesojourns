-- Rebuild the legacy uniqueness rule while preserving every child relationship.
PRAGMA defer_foreign_keys=ON;
CREATE TABLE people_rebuilt (
  id TEXT PRIMARY KEY,
  first_name TEXT NOT NULL,
  last_name TEXT NOT NULL,
  first_name_normalized TEXT NOT NULL,
  last_name_normalized TEXT NOT NULL,
  email TEXT NOT NULL,
  email_normalized TEXT NOT NULL,
  phone TEXT,
  phone_normalized TEXT,
  contact_preference TEXT NOT NULL DEFAULT 'email'
    CHECK (contact_preference IN ('email', 'phone')),
  field_of_study TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL, preferred_name TEXT, address_line_1 TEXT, address_line_2 TEXT, city TEXT, region TEXT, postal_code TEXT, country TEXT, organization TEXT, website TEXT, notes TEXT, record_source TEXT NOT NULL DEFAULT 'form'
  CHECK (record_source IN ('form', 'manual')), contact_status TEXT NOT NULL DEFAULT 'active'
  CHECK (contact_status IN ('active', 'inactive')), last_contacted_at TEXT, last_contacted_note TEXT
CHECK (last_contacted_note IS NULL OR length(last_contacted_note) <= 50),
  approved_duplicate INTEGER NOT NULL DEFAULT 0 CHECK(approved_duplicate IN (0,1))
);
INSERT INTO people_rebuilt(id,first_name,last_name,first_name_normalized,last_name_normalized,email,email_normalized,phone,phone_normalized,contact_preference,field_of_study,created_at,updated_at,preferred_name,address_line_1,address_line_2,city,region,postal_code,country,organization,website,notes,record_source,contact_status,last_contacted_at,last_contacted_note) SELECT id,first_name,last_name,first_name_normalized,last_name_normalized,email,email_normalized,phone,phone_normalized,contact_preference,field_of_study,created_at,updated_at,preferred_name,address_line_1,address_line_2,city,region,postal_code,country,organization,website,notes,record_source,contact_status,last_contacted_at,last_contacted_note FROM people;
CREATE TABLE _hold_contact_types AS SELECT * FROM contact_types;
CREATE TABLE _hold_contact_languages AS SELECT * FROM contact_languages;
CREATE TABLE _hold_contact_areas AS SELECT * FROM contact_areas;
CREATE TABLE _hold_contact_trips AS SELECT * FROM contact_trips;
CREATE TABLE _hold_ministry_contacts AS SELECT * FROM ministry_contacts;
CREATE TABLE _hold_ministry_tasks AS SELECT * FROM ministry_tasks;
CREATE TABLE _hold_ledger_entries AS SELECT id,person_id FROM ledger_entries WHERE person_id IS NOT NULL;
CREATE TABLE _hold_trip_funding_sources AS SELECT id,person_id FROM trip_funding_sources WHERE person_id IS NOT NULL;
CREATE TABLE _hold_trip_accounts AS SELECT id,person_id FROM trip_accounts WHERE person_id IS NOT NULL;
DROP TRIGGER "people_us_phone_insert";
DROP TRIGGER "people_us_phone_update";
DROP TRIGGER "donation_split_keep_person";
DROP TABLE people;
ALTER TABLE people_rebuilt RENAME TO people;
CREATE INDEX people_email_idx ON people (email_normalized);
CREATE INDEX people_phone_idx ON people (phone_normalized) WHERE phone_normalized IS NOT NULL;
CREATE INDEX people_contact_preference_idx
ON people (contact_preference);
CREATE INDEX people_contact_status_name_idx
ON people (contact_status, last_name_normalized, first_name_normalized);
CREATE INDEX people_organization_idx
ON people (organization COLLATE NOCASE) WHERE organization IS NOT NULL;
CREATE UNIQUE INDEX people_default_identity ON people(email_normalized,first_name_normalized,last_name_normalized) WHERE approved_duplicate=0;
INSERT INTO contact_types SELECT * FROM _hold_contact_types;
DROP TABLE _hold_contact_types;
INSERT INTO contact_languages SELECT * FROM _hold_contact_languages;
DROP TABLE _hold_contact_languages;
INSERT INTO contact_areas SELECT * FROM _hold_contact_areas;
DROP TABLE _hold_contact_areas;
INSERT INTO contact_trips SELECT * FROM _hold_contact_trips;
DROP TABLE _hold_contact_trips;
INSERT INTO ministry_contacts SELECT * FROM _hold_ministry_contacts;
DROP TABLE _hold_ministry_contacts;
INSERT INTO ministry_tasks SELECT * FROM _hold_ministry_tasks;
DROP TABLE _hold_ministry_tasks;
UPDATE ledger_entries SET person_id=(SELECT person_id FROM _hold_ledger_entries h WHERE h.id=ledger_entries.id) WHERE id IN (SELECT id FROM _hold_ledger_entries);
DROP TABLE _hold_ledger_entries;
UPDATE trip_funding_sources SET person_id=(SELECT person_id FROM _hold_trip_funding_sources h WHERE h.id=trip_funding_sources.id) WHERE id IN (SELECT id FROM _hold_trip_funding_sources);
DROP TABLE _hold_trip_funding_sources;
UPDATE trip_accounts SET person_id=(SELECT person_id FROM _hold_trip_accounts h WHERE h.id=trip_accounts.id) WHERE id IN (SELECT id FROM _hold_trip_accounts);
DROP TABLE _hold_trip_accounts;
CREATE TRIGGER people_us_phone_insert AFTER INSERT ON people WHEN NEW.phone IS NOT NULL AND NEW.phone NOT GLOB '*[^0-9+(). -]*' AND (substr(trim(NEW.phone),1,1)<>'+' OR trim(NEW.phone) LIKE '+1%') AND length((CASE WHEN length(replace(replace(replace(replace(replace(replace(NEW.phone,' ',''),'-',''),'(',''),')',''),'.',''),'+',''))=11 AND substr(replace(replace(replace(replace(replace(replace(NEW.phone,' ',''),'-',''),'(',''),')',''),'.',''),'+',''),1,1)='1' THEN substr(replace(replace(replace(replace(replace(replace(NEW.phone,' ',''),'-',''),'(',''),')',''),'.',''),'+',''),2) ELSE replace(replace(replace(replace(replace(replace(NEW.phone,' ',''),'-',''),'(',''),')',''),'.',''),'+','') END))=10 AND (CASE WHEN length(replace(replace(replace(replace(replace(replace(NEW.phone,' ',''),'-',''),'(',''),')',''),'.',''),'+',''))=11 AND substr(replace(replace(replace(replace(replace(replace(NEW.phone,' ',''),'-',''),'(',''),')',''),'.',''),'+',''),1,1)='1' THEN substr(replace(replace(replace(replace(replace(replace(NEW.phone,' ',''),'-',''),'(',''),')',''),'.',''),'+',''),2) ELSE replace(replace(replace(replace(replace(replace(NEW.phone,' ',''),'-',''),'(',''),')',''),'.',''),'+','') END) GLOB '[2-9][0-9][0-9][2-9][0-9][0-9][0-9][0-9][0-9][0-9]' AND upper(trim(COALESCE(NEW.country,''))) IN ('','US','USA','UNITED STATES','UNITED STATES OF AMERICA') AND (NEW.phone<>(CASE WHEN length(replace(replace(replace(replace(replace(replace(NEW.phone,' ',''),'-',''),'(',''),')',''),'.',''),'+',''))=11 AND substr(replace(replace(replace(replace(replace(replace(NEW.phone,' ',''),'-',''),'(',''),')',''),'.',''),'+',''),1,1)='1' THEN substr(replace(replace(replace(replace(replace(replace(NEW.phone,' ',''),'-',''),'(',''),')',''),'.',''),'+',''),2) ELSE replace(replace(replace(replace(replace(replace(NEW.phone,' ',''),'-',''),'(',''),')',''),'.',''),'+','') END) OR COALESCE(NEW.phone_normalized,'')<>(CASE WHEN length(replace(replace(replace(replace(replace(replace(NEW.phone,' ',''),'-',''),'(',''),')',''),'.',''),'+',''))=11 AND substr(replace(replace(replace(replace(replace(replace(NEW.phone,' ',''),'-',''),'(',''),')',''),'.',''),'+',''),1,1)='1' THEN substr(replace(replace(replace(replace(replace(replace(NEW.phone,' ',''),'-',''),'(',''),')',''),'.',''),'+',''),2) ELSE replace(replace(replace(replace(replace(replace(NEW.phone,' ',''),'-',''),'(',''),')',''),'.',''),'+','') END)) BEGIN UPDATE people SET phone=(CASE WHEN length(replace(replace(replace(replace(replace(replace(NEW.phone,' ',''),'-',''),'(',''),')',''),'.',''),'+',''))=11 AND substr(replace(replace(replace(replace(replace(replace(NEW.phone,' ',''),'-',''),'(',''),')',''),'.',''),'+',''),1,1)='1' THEN substr(replace(replace(replace(replace(replace(replace(NEW.phone,' ',''),'-',''),'(',''),')',''),'.',''),'+',''),2) ELSE replace(replace(replace(replace(replace(replace(NEW.phone,' ',''),'-',''),'(',''),')',''),'.',''),'+','') END),phone_normalized=(CASE WHEN length(replace(replace(replace(replace(replace(replace(NEW.phone,' ',''),'-',''),'(',''),')',''),'.',''),'+',''))=11 AND substr(replace(replace(replace(replace(replace(replace(NEW.phone,' ',''),'-',''),'(',''),')',''),'.',''),'+',''),1,1)='1' THEN substr(replace(replace(replace(replace(replace(replace(NEW.phone,' ',''),'-',''),'(',''),')',''),'.',''),'+',''),2) ELSE replace(replace(replace(replace(replace(replace(NEW.phone,' ',''),'-',''),'(',''),')',''),'.',''),'+','') END) WHERE id=NEW.id; END;
CREATE TRIGGER people_us_phone_update AFTER UPDATE ON people WHEN NEW.phone IS NOT NULL AND NEW.phone NOT GLOB '*[^0-9+(). -]*' AND (substr(trim(NEW.phone),1,1)<>'+' OR trim(NEW.phone) LIKE '+1%') AND length((CASE WHEN length(replace(replace(replace(replace(replace(replace(NEW.phone,' ',''),'-',''),'(',''),')',''),'.',''),'+',''))=11 AND substr(replace(replace(replace(replace(replace(replace(NEW.phone,' ',''),'-',''),'(',''),')',''),'.',''),'+',''),1,1)='1' THEN substr(replace(replace(replace(replace(replace(replace(NEW.phone,' ',''),'-',''),'(',''),')',''),'.',''),'+',''),2) ELSE replace(replace(replace(replace(replace(replace(NEW.phone,' ',''),'-',''),'(',''),')',''),'.',''),'+','') END))=10 AND (CASE WHEN length(replace(replace(replace(replace(replace(replace(NEW.phone,' ',''),'-',''),'(',''),')',''),'.',''),'+',''))=11 AND substr(replace(replace(replace(replace(replace(replace(NEW.phone,' ',''),'-',''),'(',''),')',''),'.',''),'+',''),1,1)='1' THEN substr(replace(replace(replace(replace(replace(replace(NEW.phone,' ',''),'-',''),'(',''),')',''),'.',''),'+',''),2) ELSE replace(replace(replace(replace(replace(replace(NEW.phone,' ',''),'-',''),'(',''),')',''),'.',''),'+','') END) GLOB '[2-9][0-9][0-9][2-9][0-9][0-9][0-9][0-9][0-9][0-9]' AND upper(trim(COALESCE(NEW.country,''))) IN ('','US','USA','UNITED STATES','UNITED STATES OF AMERICA') AND (NEW.phone<>(CASE WHEN length(replace(replace(replace(replace(replace(replace(NEW.phone,' ',''),'-',''),'(',''),')',''),'.',''),'+',''))=11 AND substr(replace(replace(replace(replace(replace(replace(NEW.phone,' ',''),'-',''),'(',''),')',''),'.',''),'+',''),1,1)='1' THEN substr(replace(replace(replace(replace(replace(replace(NEW.phone,' ',''),'-',''),'(',''),')',''),'.',''),'+',''),2) ELSE replace(replace(replace(replace(replace(replace(NEW.phone,' ',''),'-',''),'(',''),')',''),'.',''),'+','') END) OR COALESCE(NEW.phone_normalized,'')<>(CASE WHEN length(replace(replace(replace(replace(replace(replace(NEW.phone,' ',''),'-',''),'(',''),')',''),'.',''),'+',''))=11 AND substr(replace(replace(replace(replace(replace(replace(NEW.phone,' ',''),'-',''),'(',''),')',''),'.',''),'+',''),1,1)='1' THEN substr(replace(replace(replace(replace(replace(replace(NEW.phone,' ',''),'-',''),'(',''),')',''),'.',''),'+',''),2) ELSE replace(replace(replace(replace(replace(replace(NEW.phone,' ',''),'-',''),'(',''),')',''),'.',''),'+','') END)) BEGIN UPDATE people SET phone=(CASE WHEN length(replace(replace(replace(replace(replace(replace(NEW.phone,' ',''),'-',''),'(',''),')',''),'.',''),'+',''))=11 AND substr(replace(replace(replace(replace(replace(replace(NEW.phone,' ',''),'-',''),'(',''),')',''),'.',''),'+',''),1,1)='1' THEN substr(replace(replace(replace(replace(replace(replace(NEW.phone,' ',''),'-',''),'(',''),')',''),'.',''),'+',''),2) ELSE replace(replace(replace(replace(replace(replace(NEW.phone,' ',''),'-',''),'(',''),')',''),'.',''),'+','') END),phone_normalized=(CASE WHEN length(replace(replace(replace(replace(replace(replace(NEW.phone,' ',''),'-',''),'(',''),')',''),'.',''),'+',''))=11 AND substr(replace(replace(replace(replace(replace(replace(NEW.phone,' ',''),'-',''),'(',''),')',''),'.',''),'+',''),1,1)='1' THEN substr(replace(replace(replace(replace(replace(replace(NEW.phone,' ',''),'-',''),'(',''),')',''),'.',''),'+',''),2) ELSE replace(replace(replace(replace(replace(replace(NEW.phone,' ',''),'-',''),'(',''),')',''),'.',''),'+','') END) WHERE id=NEW.id; END;
CREATE TRIGGER donation_split_keep_person BEFORE DELETE ON people WHEN EXISTS(SELECT 1 FROM donation_splits,json_each(allocations_json) WHERE json_extract(value,'$.personId')=OLD.id) BEGIN SELECT RAISE(ABORT,'Person has donation allocations'); END;
CREATE TABLE contact_match_revision (id INTEGER PRIMARY KEY CHECK(id=1), revision INTEGER NOT NULL);
INSERT INTO contact_match_revision VALUES(1,0);
CREATE TRIGGER contact_match_insert AFTER INSERT ON people BEGIN UPDATE contact_match_revision SET revision=revision+1 WHERE id=1; END;
CREATE TRIGGER contact_match_update AFTER UPDATE ON people BEGIN UPDATE contact_match_revision SET revision=revision+1 WHERE id=1; END;
CREATE TRIGGER contact_match_delete AFTER DELETE ON people BEGIN UPDATE contact_match_revision SET revision=revision+1 WHERE id=1; END;
CREATE TABLE interest_intake (
 id TEXT PRIMARY KEY, idempotency_key TEXT NOT NULL UNIQUE, request_fingerprint TEXT NOT NULL UNIQUE,
 payload_json TEXT NOT NULL, opportunity_ids_json TEXT NOT NULL, trip_id TEXT REFERENCES trips(id), invite_id TEXT REFERENCES trip_invites(id), source_page TEXT,
 status TEXT NOT NULL CHECK(status IN ('pending','accepted','rejected')), person_id TEXT REFERENCES people(id) ON DELETE RESTRICT,
 created_at TEXT NOT NULL, resolved_at TEXT, reviewer_id TEXT, decision TEXT
);
CREATE TABLE interest_intake_decisions (intake_id TEXT PRIMARY KEY REFERENCES interest_intake(id), decision_json TEXT NOT NULL, reviewer_id TEXT NOT NULL, decided_at TEXT NOT NULL);
CREATE TABLE interest_intake_guards (id TEXT PRIMARY KEY, valid INTEGER NOT NULL CHECK(valid=1));
CREATE INDEX interest_intake_status ON interest_intake(status,created_at);
-- SQLite can retain deferred DROP TABLE counters after the replacement parent
-- is restored. Validate the complete graph before clearing those counters.
CREATE TABLE _interest_migration_integrity (valid INTEGER NOT NULL CHECK(valid=1));
INSERT INTO _interest_migration_integrity SELECT CASE WHEN EXISTS(SELECT 1 FROM pragma_foreign_key_check) THEN 0 ELSE 1 END;
DROP TABLE _interest_migration_integrity;
PRAGMA defer_foreign_keys=OFF;
