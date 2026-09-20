-- Recoverable copies are separate from trip records and never included in exports.
-- Existing one-way hashes cannot be backfilled. Save credentials again to enable reveal.
CREATE TABLE trip_portal_passwords (
  trip_id TEXT PRIMARY KEY REFERENCES trips(id) ON DELETE CASCADE,
  encrypted_password TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
