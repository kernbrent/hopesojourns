-- Add the optional Newsletter category without enrolling existing contacts.
-- Preserve classifications, managed access, donor rules, and volunteer access.

DROP TRIGGER "ledger_gift_contact_insert";

DROP TRIGGER "ledger_gift_contact_update";

DROP TRIGGER "portal_contact_type_guard";

DROP TRIGGER "portal_contact_type_preserve";

DROP TRIGGER "portal_contact_type_update_guard";

DROP TRIGGER "portal_contact_user_delete";

DROP TRIGGER "portal_contact_user_insert";

DROP TRIGGER "portal_contact_user_update";

DROP TRIGGER "split_gift_contact_delete";

DROP TRIGGER "split_gift_contact_insert";

DROP TRIGGER "split_gift_contact_update";

DROP TRIGGER "volunteer_contact_added";

DROP TRIGGER "volunteer_contact_removed";

CREATE TABLE newsletter_contact_types_backup AS SELECT person_id,contact_type,created_at FROM contact_types;

DROP TABLE contact_types;

CREATE TABLE "contact_types" (
  person_id TEXT NOT NULL,
  contact_type TEXT NOT NULL CHECK (contact_type IN (
    'prospective_traveler', 'traveler', 'leader', 'donor', 'potential_donor',
    'ministry_contact', 'staff', 'volunteer', 'board_member', 'portal_access', 'newsletter', 'other'
  )),
  created_at TEXT NOT NULL,
  PRIMARY KEY (person_id, contact_type),
  FOREIGN KEY (person_id) REFERENCES people(id) ON DELETE CASCADE
);

INSERT INTO contact_types(person_id,contact_type,created_at) SELECT person_id,contact_type,created_at FROM newsletter_contact_types_backup;

DROP TABLE newsletter_contact_types_backup;

CREATE INDEX contact_types_type_person_idx ON contact_types (contact_type, person_id);

CREATE TRIGGER ledger_gift_contact_insert AFTER INSERT ON ledger_entries
BEGIN
  UPDATE people SET updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now')
  WHERE id IN (SELECT g.person_id FROM donation_gifts g JOIN people p ON p.id=g.person_id WHERE g.id=NEW.id AND g.charitable_amount>0 AND EXISTS(SELECT 1 FROM ledger_entries l WHERE l.id=g.id AND l.entry_type='income' AND l.accounting_class='operating')) AND (
    NOT EXISTS(SELECT 1 FROM contact_types t WHERE t.person_id=people.id AND t.contact_type='donor')
    OR EXISTS(SELECT 1 FROM contact_types t WHERE t.person_id=people.id AND t.contact_type='potential_donor')
  );
  INSERT INTO contact_types(person_id,contact_type,created_at)
  SELECT DISTINCT g.person_id,'donor',strftime('%Y-%m-%dT%H:%M:%fZ','now')
  FROM donation_gifts g JOIN people p ON p.id=g.person_id
  WHERE g.id=NEW.id AND g.charitable_amount>0 AND EXISTS(SELECT 1 FROM ledger_entries l WHERE l.id=g.id AND l.entry_type='income' AND l.accounting_class='operating')
  ON CONFLICT(person_id,contact_type) DO NOTHING;
  DELETE FROM contact_types WHERE contact_type='potential_donor'
  AND person_id IN (SELECT g.person_id FROM donation_gifts g JOIN people p ON p.id=g.person_id WHERE g.id=NEW.id AND g.charitable_amount>0 AND EXISTS(SELECT 1 FROM ledger_entries l WHERE l.id=g.id AND l.entry_type='income' AND l.accounting_class='operating'));
END;

CREATE TRIGGER ledger_gift_contact_update AFTER UPDATE OF person_id, entry_type, charitable_amount, accounting_class ON ledger_entries
BEGIN
  UPDATE people SET updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now')
  WHERE id IN (SELECT g.person_id FROM donation_gifts g JOIN people p ON p.id=g.person_id WHERE g.id=NEW.id AND g.charitable_amount>0 AND EXISTS(SELECT 1 FROM ledger_entries l WHERE l.id=g.id AND l.entry_type='income' AND l.accounting_class='operating')) AND (
    NOT EXISTS(SELECT 1 FROM contact_types t WHERE t.person_id=people.id AND t.contact_type='donor')
    OR EXISTS(SELECT 1 FROM contact_types t WHERE t.person_id=people.id AND t.contact_type='potential_donor')
  );
  INSERT INTO contact_types(person_id,contact_type,created_at)
  SELECT DISTINCT g.person_id,'donor',strftime('%Y-%m-%dT%H:%M:%fZ','now')
  FROM donation_gifts g JOIN people p ON p.id=g.person_id
  WHERE g.id=NEW.id AND g.charitable_amount>0 AND EXISTS(SELECT 1 FROM ledger_entries l WHERE l.id=g.id AND l.entry_type='income' AND l.accounting_class='operating')
  ON CONFLICT(person_id,contact_type) DO NOTHING;
  DELETE FROM contact_types WHERE contact_type='potential_donor'
  AND person_id IN (SELECT g.person_id FROM donation_gifts g JOIN people p ON p.id=g.person_id WHERE g.id=NEW.id AND g.charitable_amount>0 AND EXISTS(SELECT 1 FROM ledger_entries l WHERE l.id=g.id AND l.entry_type='income' AND l.accounting_class='operating'));
END;

CREATE TRIGGER portal_contact_type_guard BEFORE INSERT ON contact_types
WHEN NEW.contact_type='portal_access' AND NOT EXISTS(SELECT 1 FROM mmt_users u WHERE u.hs_person_id=NEW.person_id AND u.hs_access=1 AND u.status='active' AND u.deleted_at IS NULL)
BEGIN SELECT RAISE(ABORT,'Portal Access is managed through Users & access requests'); END;

CREATE TRIGGER portal_contact_type_preserve AFTER DELETE ON contact_types
WHEN OLD.contact_type='portal_access' AND EXISTS(SELECT 1 FROM mmt_users u WHERE u.hs_person_id=OLD.person_id AND u.hs_access=1 AND u.status='active' AND u.deleted_at IS NULL)
BEGIN INSERT INTO contact_types(person_id,contact_type,created_at) VALUES(OLD.person_id,'portal_access',OLD.created_at); END;

CREATE TRIGGER portal_contact_type_update_guard BEFORE UPDATE OF person_id,contact_type ON contact_types
WHEN NEW.contact_type='portal_access' OR OLD.contact_type='portal_access'
BEGIN SELECT RAISE(ABORT,'Portal Access is managed through Users & access requests'); END;

CREATE TRIGGER portal_contact_user_delete AFTER DELETE ON mmt_users
BEGIN
 DELETE FROM contact_types WHERE person_id=OLD.hs_person_id AND contact_type='portal_access';
END;

CREATE TRIGGER portal_contact_user_insert AFTER INSERT ON mmt_users
WHEN NEW.hs_person_id IS NOT NULL AND NEW.hs_access=1 AND NEW.status='active' AND NEW.deleted_at IS NULL
BEGIN
 INSERT INTO contact_types(person_id,contact_type,created_at) VALUES(NEW.hs_person_id,'portal_access',NEW.updated_at) ON CONFLICT DO NOTHING;
END;

CREATE TRIGGER portal_contact_user_update AFTER UPDATE OF hs_person_id,hs_access,status,deleted_at ON mmt_users
BEGIN
 DELETE FROM contact_types WHERE contact_type='portal_access' AND person_id IN(OLD.hs_person_id,NEW.hs_person_id)
 AND NOT EXISTS(SELECT 1 FROM mmt_users u WHERE u.hs_person_id=contact_types.person_id AND u.hs_access=1 AND u.status='active' AND u.deleted_at IS NULL);
 INSERT INTO contact_types(person_id,contact_type,created_at)
 SELECT NEW.hs_person_id,'portal_access',NEW.updated_at WHERE NEW.hs_person_id IS NOT NULL AND NEW.hs_access=1 AND NEW.status='active' AND NEW.deleted_at IS NULL ON CONFLICT DO NOTHING;
END;

CREATE TRIGGER split_gift_contact_delete AFTER DELETE ON donation_splits
BEGIN
  UPDATE people SET updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now')
  WHERE id IN (SELECT g.person_id FROM donation_gifts g JOIN people p ON p.id=g.person_id WHERE g.id=OLD.entry_id AND g.charitable_amount>0 AND EXISTS(SELECT 1 FROM ledger_entries l WHERE l.id=g.id AND l.entry_type='income' AND l.accounting_class='operating')) AND (
    NOT EXISTS(SELECT 1 FROM contact_types t WHERE t.person_id=people.id AND t.contact_type='donor')
    OR EXISTS(SELECT 1 FROM contact_types t WHERE t.person_id=people.id AND t.contact_type='potential_donor')
  );
  INSERT INTO contact_types(person_id,contact_type,created_at)
  SELECT DISTINCT g.person_id,'donor',strftime('%Y-%m-%dT%H:%M:%fZ','now')
  FROM donation_gifts g JOIN people p ON p.id=g.person_id
  WHERE g.id=OLD.entry_id AND g.charitable_amount>0 AND EXISTS(SELECT 1 FROM ledger_entries l WHERE l.id=g.id AND l.entry_type='income' AND l.accounting_class='operating')
  ON CONFLICT(person_id,contact_type) DO NOTHING;
  DELETE FROM contact_types WHERE contact_type='potential_donor'
  AND person_id IN (SELECT g.person_id FROM donation_gifts g JOIN people p ON p.id=g.person_id WHERE g.id=OLD.entry_id AND g.charitable_amount>0 AND EXISTS(SELECT 1 FROM ledger_entries l WHERE l.id=g.id AND l.entry_type='income' AND l.accounting_class='operating'));
END;

CREATE TRIGGER split_gift_contact_insert AFTER INSERT ON donation_splits
BEGIN
  UPDATE people SET updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now')
  WHERE id IN (SELECT g.person_id FROM donation_gifts g JOIN people p ON p.id=g.person_id WHERE g.id=NEW.entry_id AND g.charitable_amount>0 AND EXISTS(SELECT 1 FROM ledger_entries l WHERE l.id=g.id AND l.entry_type='income' AND l.accounting_class='operating')) AND (
    NOT EXISTS(SELECT 1 FROM contact_types t WHERE t.person_id=people.id AND t.contact_type='donor')
    OR EXISTS(SELECT 1 FROM contact_types t WHERE t.person_id=people.id AND t.contact_type='potential_donor')
  );
  INSERT INTO contact_types(person_id,contact_type,created_at)
  SELECT DISTINCT g.person_id,'donor',strftime('%Y-%m-%dT%H:%M:%fZ','now')
  FROM donation_gifts g JOIN people p ON p.id=g.person_id
  WHERE g.id=NEW.entry_id AND g.charitable_amount>0 AND EXISTS(SELECT 1 FROM ledger_entries l WHERE l.id=g.id AND l.entry_type='income' AND l.accounting_class='operating')
  ON CONFLICT(person_id,contact_type) DO NOTHING;
  DELETE FROM contact_types WHERE contact_type='potential_donor'
  AND person_id IN (SELECT g.person_id FROM donation_gifts g JOIN people p ON p.id=g.person_id WHERE g.id=NEW.entry_id AND g.charitable_amount>0 AND EXISTS(SELECT 1 FROM ledger_entries l WHERE l.id=g.id AND l.entry_type='income' AND l.accounting_class='operating'));
END;

CREATE TRIGGER split_gift_contact_update AFTER UPDATE OF allocations_json ON donation_splits
BEGIN
  UPDATE people SET updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now')
  WHERE id IN (SELECT g.person_id FROM donation_gifts g JOIN people p ON p.id=g.person_id WHERE g.id=NEW.entry_id AND g.charitable_amount>0 AND EXISTS(SELECT 1 FROM ledger_entries l WHERE l.id=g.id AND l.entry_type='income' AND l.accounting_class='operating')) AND (
    NOT EXISTS(SELECT 1 FROM contact_types t WHERE t.person_id=people.id AND t.contact_type='donor')
    OR EXISTS(SELECT 1 FROM contact_types t WHERE t.person_id=people.id AND t.contact_type='potential_donor')
  );
  INSERT INTO contact_types(person_id,contact_type,created_at)
  SELECT DISTINCT g.person_id,'donor',strftime('%Y-%m-%dT%H:%M:%fZ','now')
  FROM donation_gifts g JOIN people p ON p.id=g.person_id
  WHERE g.id=NEW.entry_id AND g.charitable_amount>0 AND EXISTS(SELECT 1 FROM ledger_entries l WHERE l.id=g.id AND l.entry_type='income' AND l.accounting_class='operating')
  ON CONFLICT(person_id,contact_type) DO NOTHING;
  DELETE FROM contact_types WHERE contact_type='potential_donor'
  AND person_id IN (SELECT g.person_id FROM donation_gifts g JOIN people p ON p.id=g.person_id WHERE g.id=NEW.entry_id AND g.charitable_amount>0 AND EXISTS(SELECT 1 FROM ledger_entries l WHERE l.id=g.id AND l.entry_type='income' AND l.accounting_class='operating'));
END;

CREATE TRIGGER volunteer_contact_added AFTER INSERT ON contact_types WHEN NEW.contact_type='volunteer'
BEGIN UPDATE mmt_users SET volunteer_access=1 WHERE hs_person_id=NEW.person_id; END;

CREATE TRIGGER volunteer_contact_removed AFTER DELETE ON contact_types WHEN OLD.contact_type='volunteer'
BEGIN UPDATE mmt_users SET volunteer_access=0 WHERE hs_person_id=OLD.person_id; END;
