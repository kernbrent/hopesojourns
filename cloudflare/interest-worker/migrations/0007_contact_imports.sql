PRAGMA foreign_keys = ON;

CREATE TABLE contact_imports (
  id TEXT PRIMARY KEY,
  file_name TEXT NOT NULL,
  file_size INTEGER NOT NULL CHECK (file_size >= 0 AND file_size <= 2097152),
  file_type TEXT NOT NULL CHECK (file_type IN ('xlsx', 'csv')),
  total_rows INTEGER NOT NULL CHECK (total_rows >= 0),
  created_count INTEGER NOT NULL DEFAULT 0 CHECK (created_count >= 0),
  updated_count INTEGER NOT NULL DEFAULT 0 CHECK (updated_count >= 0),
  error_count INTEGER NOT NULL DEFAULT 0 CHECK (error_count >= 0),
  imported_at TEXT NOT NULL
);

CREATE INDEX contact_imports_imported_at_idx ON contact_imports (imported_at DESC);

PRAGMA optimize;
