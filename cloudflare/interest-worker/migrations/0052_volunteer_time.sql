ALTER TABLE mmt_users ADD COLUMN volunteer_access INTEGER NOT NULL DEFAULT 0 CHECK(volunteer_access IN(0,1));
UPDATE mmt_users SET volunteer_access=1 WHERE hs_person_id IN(SELECT person_id FROM contact_types WHERE contact_type='volunteer');
CREATE TRIGGER volunteer_contact_added AFTER INSERT ON contact_types WHEN NEW.contact_type='volunteer'
BEGIN UPDATE mmt_users SET volunteer_access=1 WHERE hs_person_id=NEW.person_id; END;
CREATE TRIGGER volunteer_contact_removed AFTER DELETE ON contact_types WHEN OLD.contact_type='volunteer'
BEGIN UPDATE mmt_users SET volunteer_access=0 WHERE hs_person_id=OLD.person_id; END;

CREATE TABLE volunteer_organizations (
 id TEXT PRIMARY KEY, ministry_id TEXT UNIQUE REFERENCES ministries(id) ON DELETE RESTRICT,
 name TEXT NOT NULL, classification TEXT NOT NULL DEFAULT 'other',
 active INTEGER NOT NULL DEFAULT 1 CHECK(active IN(0,1)), revision INTEGER NOT NULL DEFAULT 1,
 created_at TEXT NOT NULL, updated_at TEXT NOT NULL
);
CREATE UNIQUE INDEX volunteer_org_name ON volunteer_organizations(lower(trim(name)));
INSERT INTO volunteer_organizations(id,ministry_id,name,classification,created_at,updated_at)
 SELECT id,id,name,'ministry_partner',created_at,updated_at FROM ministries;
UPDATE volunteer_organizations SET active=0 WHERE ministry_id IN(SELECT id FROM ministries WHERE status='inactive');
INSERT INTO volunteer_organizations(id,name,classification,created_at,updated_at)
 SELECT 'hope-sojourns','Hope Sojourns','ministry_partner',strftime('%Y-%m-%dT%H:%M:%fZ','now'),strftime('%Y-%m-%dT%H:%M:%fZ','now')
 WHERE NOT EXISTS(SELECT 1 FROM volunteer_organizations WHERE lower(trim(name))='hope sojourns');
CREATE TRIGGER volunteer_ministry_created AFTER INSERT ON ministries
BEGIN INSERT INTO volunteer_organizations(id,ministry_id,name,classification,active,created_at,updated_at)
 VALUES(NEW.id,NEW.id,NEW.name,'ministry_partner',CASE WHEN NEW.status='active' THEN 1 ELSE 0 END,NEW.created_at,NEW.updated_at); END;
CREATE TRIGGER volunteer_ministry_updated AFTER UPDATE OF name,status ON ministries
BEGIN UPDATE volunteer_organizations SET name=NEW.name,active=CASE WHEN NEW.status='active' THEN 1 ELSE 0 END,revision=revision+1,updated_at=NEW.updated_at WHERE ministry_id=NEW.id; END;
CREATE TABLE volunteer_org_access(user_id TEXT NOT NULL REFERENCES mmt_users(id),organization_id TEXT NOT NULL REFERENCES volunteer_organizations(id),PRIMARY KEY(user_id,organization_id));
CREATE TABLE volunteer_preferences(user_id TEXT PRIMARY KEY REFERENCES mmt_users(id),recipients_json TEXT NOT NULL DEFAULT '[]',revision INTEGER NOT NULL DEFAULT 1);
CREATE TABLE volunteer_months(
 user_id TEXT NOT NULL REFERENCES mmt_users(id),month TEXT NOT NULL,
 entries_json TEXT NOT NULL DEFAULT '[]',status TEXT NOT NULL DEFAULT 'draft' CHECK(status IN('draft','submitted','approved','returned')),
 revision INTEGER NOT NULL DEFAULT 1,review_note TEXT NOT NULL DEFAULT '',reviewed_by TEXT REFERENCES mmt_users(id),
 approved_at TEXT,report_request_json TEXT,updated_at TEXT NOT NULL,PRIMARY KEY(user_id,month)
);
CREATE INDEX volunteer_month_review ON volunteer_months(status,month);
CREATE TABLE volunteer_reports(
 id TEXT PRIMARY KEY,user_id TEXT NOT NULL REFERENCES mmt_users(id),start_date TEXT NOT NULL,end_date TEXT NOT NULL,
 period_label TEXT NOT NULL,version INTEGER NOT NULL,snapshot_json TEXT NOT NULL,html TEXT NOT NULL,text TEXT NOT NULL,
 created_at TEXT NOT NULL,created_by TEXT NOT NULL REFERENCES mmt_users(id)
);
CREATE INDEX volunteer_reports_owner ON volunteer_reports(user_id,created_at);
CREATE UNIQUE INDEX volunteer_report_version ON volunteer_reports(user_id,start_date,end_date,json_extract(snapshot_json,'$.organizationId'),version);
CREATE TABLE volunteer_deliveries(
 id TEXT PRIMARY KEY,report_id TEXT NOT NULL REFERENCES volunteer_reports(id),recipient TEXT NOT NULL,
 status TEXT NOT NULL CHECK(status IN('sending','sent','failed','uncertain','captured','verified_not_sent')),
 payload_json TEXT NOT NULL,attempt_key TEXT NOT NULL UNIQUE,error TEXT,provider_id TEXT,
 created_at TEXT NOT NULL,updated_at TEXT NOT NULL
);
