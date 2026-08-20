PRAGMA foreign_keys = ON;

CREATE TABLE admin_credentials (
  id TEXT PRIMARY KEY CHECK (id = 'primary'),
  algorithm TEXT NOT NULL CHECK (algorithm = 'PBKDF2-SHA256'),
  password_salt TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  iterations INTEGER NOT NULL CHECK (iterations BETWEEN 100000 AND 1000000),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
