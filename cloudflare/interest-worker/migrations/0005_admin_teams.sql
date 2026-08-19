PRAGMA foreign_keys = ON;

CREATE TABLE teams (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  name_normalized TEXT NOT NULL UNIQUE,
  description TEXT,
  status TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'archived')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX teams_status_name_idx ON teams (status, name_normalized);

CREATE TABLE team_members (
  team_id TEXT NOT NULL,
  person_id TEXT NOT NULL,
  assigned_at TEXT NOT NULL,
  PRIMARY KEY (team_id, person_id),
  FOREIGN KEY (team_id) REFERENCES teams(id) ON DELETE CASCADE,
  FOREIGN KEY (person_id) REFERENCES people(id) ON DELETE RESTRICT
);

CREATE INDEX team_members_person_idx ON team_members (person_id, assigned_at DESC);
CREATE INDEX team_members_team_idx ON team_members (team_id, assigned_at DESC);

PRAGMA optimize;
