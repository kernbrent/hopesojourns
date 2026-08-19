PRAGMA foreign_keys = ON;

CREATE TABLE people (
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
  updated_at TEXT NOT NULL,
  UNIQUE (email_normalized, first_name_normalized, last_name_normalized)
);

CREATE INDEX people_email_idx ON people (email_normalized);
CREATE INDEX people_phone_idx ON people (phone_normalized) WHERE phone_normalized IS NOT NULL;

CREATE TABLE opportunities (
  id TEXT PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE,
  kind TEXT NOT NULL CHECK (kind IN ('trip', 'internship')),
  title TEXT NOT NULL,
  location TEXT NOT NULL,
  partner TEXT,
  duration TEXT,
  active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX opportunities_kind_active_idx ON opportunities (kind, active, sort_order);

INSERT INTO opportunities (id, slug, kind, title, location, partner, duration, sort_order) VALUES
  ('trip-athens', 'trip-athens', 'trip', 'Athens', 'Athens, Greece', 'Hope Sojourns ministry partners', NULL, 10),
  ('trip-kenya', 'trip-kenya', 'trip', 'Kenya', 'Kenya', 'The Jerri Savuto Home for Girls', NULL, 20),
  ('trip-belize', 'trip-belize', 'trip', 'Belize', 'Belize', 'Andy Ministries', NULL, 30),
  ('trip-nice', 'trip-nice', 'trip', 'Nice', 'Nice, France', 'International VBS Ministries', NULL, 40),
  ('trip-arkansas', 'trip-arkansas', 'trip', 'Shephard of the Ozarks', 'Northern Arkansas', 'Shephard of the Ozarks', NULL, 50),
  ('trip-mexico-city', 'trip-mexico-city', 'trip', 'Mexico City', 'Mexico City, Mexico', 'Metro Relief of Dallas and sister ministry', NULL, 60),
  ('trip-future-journeys', 'trip-future-journeys', 'trip', 'Future journeys', 'Domestic or international', 'Developing partnerships', NULL, 70),
  ('internship-athens-greece', 'internship-athens-greece', 'internship', 'Athens, Greece internship', 'Athens, Greece', 'New Start Ministries and Glocal Cafe', '1 to 9 months', 110),
  ('internship-england-light-group', 'internship-england-light-group', 'internship', 'England internship', 'England', 'The Light Group', '1 to 4 months', 120),
  ('internship-mexico-gods-kitchen', 'internship-mexico-gods-kitchen', 'internship', 'Mexico internship', 'Mexico', 'God''s Kitchen', '2 to 6 months', 130),
  ('internship-arkansas-soto', 'internship-arkansas-soto', 'internship', 'SOTO Arkansas internship', 'Northern Arkansas', 'Shephard of the Ozarks', '1 to 3 months', 140),
  ('internship-dallas-metro-relief', 'internship-dallas-metro-relief', 'internship', 'Metro Relief of Dallas internship', 'Dallas, Texas', 'Metro Relief of Dallas', '1 to 3 months', 150);

CREATE TABLE interest_submissions (
  id TEXT PRIMARY KEY,
  person_id TEXT NOT NULL,
  idempotency_key TEXT NOT NULL UNIQUE,
  request_fingerprint TEXT NOT NULL UNIQUE,
  selected_opportunities_json TEXT NOT NULL,
  preferred_timing TEXT,
  message TEXT,
  source_page TEXT,
  consent_at TEXT NOT NULL,
  result_json TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (person_id) REFERENCES people(id) ON DELETE RESTRICT
);

CREATE INDEX interest_submissions_person_idx ON interest_submissions (person_id, created_at DESC);

CREATE TABLE interests (
  id TEXT PRIMARY KEY,
  person_id TEXT NOT NULL,
  opportunity_id TEXT NOT NULL,
  submission_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'new'
    CHECK (status IN ('new', 'contacted', 'exploring', 'closed')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (person_id) REFERENCES people(id) ON DELETE RESTRICT,
  FOREIGN KEY (opportunity_id) REFERENCES opportunities(id) ON DELETE RESTRICT,
  FOREIGN KEY (submission_id) REFERENCES interest_submissions(id) ON DELETE RESTRICT,
  UNIQUE (person_id, opportunity_id)
);

CREATE INDEX interests_status_idx ON interests (status, created_at DESC);
CREATE INDEX interests_opportunity_idx ON interests (opportunity_id, status, created_at DESC);

-- The public interest form does not write to this table. It reserves a clean,
-- separate place for the more sensitive trip-registration workflow.
CREATE TABLE trip_registrations (
  id TEXT PRIMARY KEY,
  person_id TEXT NOT NULL,
  opportunity_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'started'
    CHECK (status IN ('started', 'invited', 'submitted', 'under_review', 'approved', 'declined', 'withdrawn')),
  started_at TEXT NOT NULL,
  submitted_at TEXT,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (person_id) REFERENCES people(id) ON DELETE RESTRICT,
  FOREIGN KEY (opportunity_id) REFERENCES opportunities(id) ON DELETE RESTRICT,
  UNIQUE (person_id, opportunity_id)
);

CREATE INDEX trip_registrations_status_idx ON trip_registrations (status, updated_at DESC);

CREATE TABLE audit_events (
  id TEXT PRIMARY KEY,
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  event_type TEXT NOT NULL,
  metadata_json TEXT,
  created_at TEXT NOT NULL
);

CREATE INDEX audit_events_entity_idx ON audit_events (entity_type, entity_id, created_at DESC);
