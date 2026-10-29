-- Seeded only through the authenticated deployment CLI, never via a public route.
-- Acceptance is allowed only while the organization has no user accounts.
CREATE TABLE initial_admin_setup (
 id INTEGER PRIMARY KEY CHECK(id=1), email TEXT NOT NULL COLLATE NOCASE,
 token_hash TEXT NOT NULL UNIQUE, expires_at INTEGER NOT NULL, used_at INTEGER
);
