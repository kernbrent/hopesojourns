PRAGMA foreign_keys = ON;

CREATE TABLE ledger_receipts (
  id TEXT PRIMARY KEY,
  ledger_entry_id TEXT NOT NULL REFERENCES ledger_entries(id) ON DELETE CASCADE,
  object_key TEXT NOT NULL UNIQUE,
  original_file_name TEXT NOT NULL,
  media_type TEXT NOT NULL CHECK (media_type IN ('image/jpeg', 'image/png', 'image/webp', 'image/avif', 'image/heic', 'image/heif', 'application/pdf')),
  file_size INTEGER NOT NULL CHECK (file_size > 0 AND file_size <= 10485760),
  sha256 TEXT NOT NULL CHECK (length(sha256) = 64),
  created_by_session_id TEXT,
  created_at TEXT NOT NULL
);

CREATE INDEX ledger_receipts_entry_idx ON ledger_receipts (ledger_entry_id, created_at DESC);

PRAGMA optimize;
