-- Verified recovery-address changes. Tokens are hashed and never returned to the requester.
CREATE TABLE mmt_email_changes (
 user_id TEXT PRIMARY KEY REFERENCES mmt_users(id),
 token_hash TEXT NOT NULL UNIQUE,
 old_email TEXT NOT NULL,
 new_email TEXT NOT NULL COLLATE NOCASE,
 user_revision INTEGER NOT NULL,
 expires_at TEXT NOT NULL,
 ready INTEGER NOT NULL DEFAULT 0 CHECK(ready IN (0,1)),
 consumed_at TEXT,
 claim TEXT,
 created_at TEXT NOT NULL
);
