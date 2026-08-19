PRAGMA foreign_keys = ON;

ALTER TABLE people ADD COLUMN preferred_name TEXT;
ALTER TABLE people ADD COLUMN address_line_1 TEXT;
ALTER TABLE people ADD COLUMN address_line_2 TEXT;
ALTER TABLE people ADD COLUMN city TEXT;
ALTER TABLE people ADD COLUMN region TEXT;
ALTER TABLE people ADD COLUMN postal_code TEXT;
ALTER TABLE people ADD COLUMN country TEXT;
ALTER TABLE people ADD COLUMN organization TEXT;
ALTER TABLE people ADD COLUMN website TEXT;
ALTER TABLE people ADD COLUMN notes TEXT;
ALTER TABLE people ADD COLUMN record_source TEXT NOT NULL DEFAULT 'form'
  CHECK (record_source IN ('form', 'manual'));
ALTER TABLE people ADD COLUMN contact_status TEXT NOT NULL DEFAULT 'active'
  CHECK (contact_status IN ('active', 'inactive'));
ALTER TABLE people ADD COLUMN last_contacted_at TEXT;

CREATE TABLE contact_types (
  person_id TEXT NOT NULL,
  contact_type TEXT NOT NULL
    CHECK (contact_type IN (
      'prospective_traveler', 'traveler', 'leader', 'donor',
      'ministry_contact', 'staff', 'volunteer', 'other'
    )),
  created_at TEXT NOT NULL,
  PRIMARY KEY (person_id, contact_type),
  FOREIGN KEY (person_id) REFERENCES people(id) ON DELETE CASCADE
);

CREATE INDEX contact_types_type_person_idx ON contact_types (contact_type, person_id);

INSERT OR IGNORE INTO contact_types (person_id, contact_type, created_at)
SELECT DISTINCT person_id, 'prospective_traveler', created_at
FROM interest_submissions;

CREATE TABLE contact_languages (
  person_id TEXT NOT NULL,
  language TEXT NOT NULL,
  language_normalized TEXT NOT NULL,
  created_at TEXT NOT NULL,
  PRIMARY KEY (person_id, language_normalized),
  FOREIGN KEY (person_id) REFERENCES people(id) ON DELETE CASCADE
);

CREATE INDEX contact_languages_language_idx ON contact_languages (language_normalized, person_id);

CREATE TABLE contact_areas (
  person_id TEXT NOT NULL,
  area TEXT NOT NULL CHECK (area IN ('mission', 'intern', 'corporate')),
  created_at TEXT NOT NULL,
  PRIMARY KEY (person_id, area),
  FOREIGN KEY (person_id) REFERENCES people(id) ON DELETE CASCADE
);

CREATE INDEX contact_areas_area_person_idx ON contact_areas (area, person_id);

CREATE TABLE contact_trips (
  person_id TEXT NOT NULL,
  opportunity_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  PRIMARY KEY (person_id, opportunity_id),
  FOREIGN KEY (person_id) REFERENCES people(id) ON DELETE CASCADE,
  FOREIGN KEY (opportunity_id) REFERENCES opportunities(id) ON DELETE RESTRICT
);

CREATE INDEX contact_trips_opportunity_person_idx ON contact_trips (opportunity_id, person_id);

CREATE TABLE ministries (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  name_normalized TEXT NOT NULL UNIQUE,
  description TEXT,
  address_line_1 TEXT,
  address_line_2 TEXT,
  city TEXT,
  region TEXT,
  postal_code TEXT,
  country TEXT,
  email TEXT,
  phone TEXT,
  website TEXT,
  notes TEXT,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX ministries_status_name_idx ON ministries (status, name_normalized);
CREATE INDEX ministries_country_idx ON ministries (country, name_normalized) WHERE country IS NOT NULL;

CREATE TABLE ministry_contacts (
  ministry_id TEXT NOT NULL,
  person_id TEXT NOT NULL,
  role TEXT,
  is_primary INTEGER NOT NULL DEFAULT 0 CHECK (is_primary IN (0, 1)),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (ministry_id, person_id),
  FOREIGN KEY (ministry_id) REFERENCES ministries(id) ON DELETE CASCADE,
  FOREIGN KEY (person_id) REFERENCES people(id) ON DELETE CASCADE
);

CREATE INDEX ministry_contacts_person_idx ON ministry_contacts (person_id, ministry_id);
CREATE INDEX ministry_contacts_ministry_primary_idx ON ministry_contacts (ministry_id, is_primary DESC);

CREATE TABLE ministry_opportunities (
  ministry_id TEXT NOT NULL,
  opportunity_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  PRIMARY KEY (ministry_id, opportunity_id),
  FOREIGN KEY (ministry_id) REFERENCES ministries(id) ON DELETE CASCADE,
  FOREIGN KEY (opportunity_id) REFERENCES opportunities(id) ON DELETE RESTRICT
);

CREATE INDEX ministry_opportunities_opportunity_idx ON ministry_opportunities (opportunity_id, ministry_id);

CREATE INDEX people_contact_status_name_idx
ON people (contact_status, last_name_normalized, first_name_normalized);

CREATE INDEX people_organization_idx
ON people (organization COLLATE NOCASE) WHERE organization IS NOT NULL;

PRAGMA optimize;
