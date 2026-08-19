PRAGMA foreign_keys = ON;

CREATE TABLE admin_sessions (
  id TEXT PRIMARY KEY,
  token_hash TEXT NOT NULL UNIQUE,
  csrf_token TEXT NOT NULL,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  last_seen_at TEXT NOT NULL,
  user_agent_hash TEXT
);

CREATE INDEX admin_sessions_expiry_idx ON admin_sessions (expires_at);

CREATE TABLE admin_login_attempts (
  key_hash TEXT PRIMARY KEY,
  failure_count INTEGER NOT NULL DEFAULT 0,
  window_started_at TEXT NOT NULL,
  blocked_until TEXT,
  updated_at TEXT NOT NULL
);

CREATE INDEX admin_login_attempts_updated_idx ON admin_login_attempts (updated_at);

CREATE TABLE submission_replies (
  id TEXT PRIMARY KEY,
  submission_id TEXT NOT NULL,
  recipient_email TEXT NOT NULL,
  subject TEXT NOT NULL,
  body TEXT NOT NULL,
  delivery_method TEXT NOT NULL
    CHECK (delivery_method IN ('email_service', 'email_client')),
  delivery_status TEXT NOT NULL DEFAULT 'draft'
    CHECK (delivery_status IN ('draft', 'sent', 'failed')),
  provider_message_id TEXT,
  error_message TEXT,
  created_at TEXT NOT NULL,
  sent_at TEXT,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (submission_id) REFERENCES interest_submissions(id) ON DELETE RESTRICT
);

CREATE INDEX submission_replies_submission_idx ON submission_replies (submission_id, created_at DESC);
CREATE INDEX submission_replies_status_idx ON submission_replies (delivery_status, created_at DESC);
