CREATE TABLE invitation_deliveries (
 invite_id TEXT PRIMARY KEY REFERENCES invites(id) ON DELETE CASCADE,
 email_status TEXT NOT NULL CHECK(email_status IN ('sending','sent','captured','failed')),
 updated_at INTEGER NOT NULL
);
