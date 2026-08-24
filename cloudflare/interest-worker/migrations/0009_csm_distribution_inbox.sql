PRAGMA foreign_keys = ON;

CREATE TABLE csm_distribution_inbox (
  id TEXT PRIMARY KEY,
  message_id TEXT NOT NULL UNIQUE,
  idempotency_key TEXT NOT NULL UNIQUE,
  schema_version INTEGER NOT NULL,
  source_record_id TEXT NOT NULL,
  source_transaction_id TEXT NOT NULL,
  source_event_code TEXT NOT NULL,
  source_revision INTEGER NOT NULL CHECK (source_revision > 0),
  direction TEXT NOT NULL CHECK (direction IN ('received', 'sent')),
  display_name TEXT NOT NULL,
  master_donor_id TEXT,
  payload_json TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('pending', 'needs_match', 'approved', 'denied', 'failed')),
  matched_person_id TEXT REFERENCES people(id) ON DELETE RESTRICT,
  match_method TEXT CHECK (match_method IS NULL OR match_method IN ('master_link', 'email', 'manual', 'new_donor')),
  decision_reason TEXT,
  recipient_record_id TEXT,
  callback_status TEXT NOT NULL DEFAULT 'not_needed' CHECK (callback_status IN ('not_needed', 'pending', 'sent', 'failed')),
  callback_attempts INTEGER NOT NULL DEFAULT 0,
  callback_error TEXT,
  received_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  decided_at TEXT,
  decided_by_session_id TEXT,
  UNIQUE (source_record_id, source_revision)
);

CREATE INDEX csm_distribution_inbox_status_idx ON csm_distribution_inbox (status, received_at DESC);
CREATE INDEX csm_distribution_inbox_transaction_idx ON csm_distribution_inbox (source_transaction_id, source_event_code);

CREATE TABLE csm_donor_links (
  master_donor_id TEXT PRIMARY KEY,
  person_id TEXT NOT NULL REFERENCES people(id) ON DELETE RESTRICT,
  created_from_inbox_id TEXT NOT NULL REFERENCES csm_distribution_inbox(id) ON DELETE RESTRICT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX csm_donor_links_person_idx ON csm_donor_links (person_id);

CREATE TABLE financial_transactions (
  id TEXT PRIMARY KEY,
  source_inbox_id TEXT NOT NULL UNIQUE REFERENCES csm_distribution_inbox(id) ON DELETE RESTRICT,
  idempotency_key TEXT NOT NULL UNIQUE,
  paypal_transaction_id TEXT NOT NULL,
  paypal_event_code TEXT NOT NULL,
  transaction_date TEXT NOT NULL,
  direction TEXT NOT NULL CHECK (direction IN ('received', 'sent')),
  display_name TEXT NOT NULL,
  person_id TEXT REFERENCES people(id) ON DELETE RESTRICT,
  currency TEXT NOT NULL CHECK (currency = 'USD'),
  gross REAL NOT NULL,
  fee REAL NOT NULL,
  net REAL NOT NULL,
  item_name TEXT,
  item_id TEXT,
  created_at TEXT NOT NULL,
  CHECK ((direction = 'received' AND person_id IS NOT NULL AND gross > 0) OR (direction = 'sent' AND person_id IS NULL AND gross < 0)),
  UNIQUE (paypal_transaction_id, paypal_event_code)
);

CREATE INDEX financial_transactions_date_idx ON financial_transactions (transaction_date DESC);
CREATE INDEX financial_transactions_person_idx ON financial_transactions (person_id, transaction_date DESC);

PRAGMA optimize;
