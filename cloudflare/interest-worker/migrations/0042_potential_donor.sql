-- Expand the contact-type constraint, then perform the requested one-time cleanup.
CREATE TABLE contact_types_expanded (
  person_id TEXT NOT NULL,
  contact_type TEXT NOT NULL CHECK (contact_type IN (
    'prospective_traveler', 'traveler', 'leader', 'donor', 'potential_donor',
    'ministry_contact', 'staff', 'volunteer', 'other'
  )),
  created_at TEXT NOT NULL,
  PRIMARY KEY (person_id, contact_type),
  FOREIGN KEY (person_id) REFERENCES people(id) ON DELETE CASCADE
);
INSERT INTO contact_types_expanded SELECT person_id, contact_type, created_at FROM contact_types;
DROP TABLE contact_types;
ALTER TABLE contact_types_expanded RENAME TO contact_types;
CREATE INDEX contact_types_type_person_idx ON contact_types (contact_type, person_id);

-- Review uncertain income or identity matches instead of demoting a possible giver.
-- All recorded history counts, including original split-gift allocations.
CREATE TABLE _potential_donor_candidates AS
SELECT p.id AS person_id,c.created_at AS donor_created_at,
  EXISTS(SELECT 1 FROM contact_types t WHERE t.person_id=p.id AND t.contact_type='potential_donor') AS already_potential
FROM people p JOIN contact_types c ON c.person_id=p.id AND c.contact_type='donor'
WHERE NOT EXISTS(SELECT 1 FROM donation_gifts g WHERE g.person_id=p.id AND g.charitable_amount>0)
AND NOT EXISTS(SELECT 1 FROM ledger_entries l WHERE l.person_id=p.id AND l.entry_type='income')
AND NOT EXISTS(SELECT 1 FROM ledger_entries l WHERE l.person_id IS NULL AND l.entry_type='income' AND lower(trim(l.name))=lower(trim(p.first_name||' '||p.last_name)))
AND NOT EXISTS(SELECT 1 FROM people q JOIN donation_gifts g ON g.person_id=q.id WHERE q.id<>p.id AND g.charitable_amount>0 AND
  ((p.email_normalized<>'' AND q.email_normalized=p.email_normalized) OR (q.first_name_normalized=p.first_name_normalized AND q.last_name_normalized=p.last_name_normalized)))
AND NOT EXISTS(SELECT 1 FROM csm_distribution_inbox i WHERE i.direction='received' AND i.status IN('pending','needs_match','failed') AND
  (i.matched_person_id=p.id OR (p.email_normalized<>'' AND lower(json_extract(i.payload_json,'$.party.email'))=p.email_normalized) OR lower(trim(i.display_name))=lower(trim(p.first_name||' '||p.last_name))));

INSERT INTO audit_events(id,entity_type,entity_id,event_type,metadata_json,created_at)
SELECT 'potential-donor-0042-'||person_id,'person',person_id,'contact_type_reclassified',
  json_object('from','donor','to','potential_donor','reason','No recorded lifetime HS giving; requested donor cleanup',
    'donorCreatedAt',donor_created_at,'alreadyPotential',already_potential,'migration','0042'),
  strftime('%Y-%m-%dT%H:%M:%fZ','now') FROM _potential_donor_candidates;
INSERT OR IGNORE INTO contact_types(person_id,contact_type,created_at)
SELECT person_id,'potential_donor',strftime('%Y-%m-%dT%H:%M:%fZ','now') FROM _potential_donor_candidates;
DELETE FROM contact_types WHERE contact_type='donor' AND person_id IN(SELECT person_id FROM _potential_donor_candidates);
UPDATE people SET updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id IN(SELECT person_id FROM _potential_donor_candidates);
DROP TABLE _potential_donor_candidates;
