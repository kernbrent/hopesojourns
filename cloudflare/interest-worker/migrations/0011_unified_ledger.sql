PRAGMA foreign_keys = ON;

CREATE TABLE ledger_entries (
  id TEXT PRIMARY KEY,
  source_type TEXT NOT NULL CHECK (source_type IN ('csm', 'import', 'manual')),
  import_key TEXT NOT NULL UNIQUE,
  content_fingerprint TEXT NOT NULL,
  financial_transaction_id TEXT UNIQUE REFERENCES financial_transactions(id) ON DELETE RESTRICT,
  source_file_name TEXT,
  source_row_number INTEGER,
  transaction_date TEXT NOT NULL,
  entry_type TEXT NOT NULL CHECK (entry_type IN ('income', 'expense')),
  payment_type TEXT NOT NULL,
  expense_category TEXT,
  budget_category TEXT NOT NULL,
  amount REAL NOT NULL CHECK (amount > 0),
  name TEXT,
  person_id TEXT REFERENCES people(id) ON DELETE SET NULL,
  note TEXT,
  currency TEXT NOT NULL DEFAULT 'USD' CHECK (currency = 'USD'),
  gross REAL,
  fee REAL,
  net REAL,
  created_by_session_id TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  CHECK (
    (source_type = 'csm' AND financial_transaction_id IS NOT NULL)
    OR (source_type IN ('import', 'manual') AND financial_transaction_id IS NULL)
  )
);

CREATE INDEX ledger_entries_date_idx ON ledger_entries (transaction_date DESC, created_at DESC);
CREATE INDEX ledger_entries_type_idx ON ledger_entries (entry_type, transaction_date DESC);
CREATE INDEX ledger_entries_person_idx ON ledger_entries (person_id, transaction_date DESC);
CREATE INDEX ledger_entries_source_idx ON ledger_entries (source_type, transaction_date DESC);

INSERT OR IGNORE INTO ledger_entries (
  id, source_type, import_key, content_fingerprint, financial_transaction_id,
  transaction_date, entry_type, payment_type, expense_category, budget_category,
  amount, name, person_id, note, currency, gross, fee, net, created_at, updated_at
)
SELECT
  'ledger-' || id,
  'csm',
  'csm:' || idempotency_key,
  idempotency_key,
  id,
  transaction_date,
  CASE direction WHEN 'received' THEN 'income' ELSE 'expense' END,
  'PayPal',
  CASE WHEN direction = 'sent' THEN 'Ministry support' ELSE NULL END,
  'General',
  CASE WHEN ABS(net) > 0 THEN ABS(net) ELSE ABS(gross) END,
  display_name,
  person_id,
  item_name,
  currency,
  gross,
  fee,
  net,
  created_at,
  created_at
FROM financial_transactions;

PRAGMA optimize;
