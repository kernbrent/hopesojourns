ALTER TABLE people ADD COLUMN email_shared INTEGER NOT NULL DEFAULT 0 CHECK(email_shared IN (0,1));
CREATE TABLE contact_relationships (
  person_a TEXT NOT NULL REFERENCES people(id) ON DELETE CASCADE,
  person_b TEXT NOT NULL REFERENCES people(id) ON DELETE CASCADE,
  relationship TEXT NOT NULL CHECK(relationship IN ('spouse','parent','child','sibling','other')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY(person_a,person_b),
  CHECK(person_a < person_b)
);
CREATE INDEX contact_relationships_b_idx ON contact_relationships(person_b);
