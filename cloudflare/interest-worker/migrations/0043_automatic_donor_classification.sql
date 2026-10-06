-- Promote only contacts linked to saved positive gifts, atomically with the gift.
-- Other contact types and prior donor history are preserved. Pending inbox rows do not trigger this.

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
