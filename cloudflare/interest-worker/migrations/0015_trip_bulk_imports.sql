CREATE TABLE trip_bulk_import_rows (
  id TEXT PRIMARY KEY,
  trip_id TEXT NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
  entity_type TEXT NOT NULL,
  external_key TEXT NOT NULL,
  entity_id TEXT,
  content_fingerprint TEXT NOT NULL,
  source_file_name TEXT NOT NULL,
  source_sheet TEXT NOT NULL,
  source_row INTEGER NOT NULL,
  created_at TEXT NOT NULL,
  UNIQUE (trip_id, entity_type, external_key)
);

CREATE INDEX idx_trip_bulk_import_rows_trip ON trip_bulk_import_rows (trip_id, created_at DESC);
