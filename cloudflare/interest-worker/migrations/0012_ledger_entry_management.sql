PRAGMA foreign_keys = ON;

ALTER TABLE ledger_entries ADD COLUMN check_number TEXT;

PRAGMA optimize;
