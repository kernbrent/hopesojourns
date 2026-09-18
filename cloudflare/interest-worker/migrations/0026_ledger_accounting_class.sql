-- Keep balance-sheet transfers visible without treating them as ministry expenses.
ALTER TABLE ledger_entries ADD COLUMN accounting_class TEXT NOT NULL DEFAULT 'operating'
  CHECK (accounting_class IN ('operating', 'internal_transfer'));

UPDATE ledger_entries
SET accounting_class = 'internal_transfer'
WHERE financial_transaction_id IN (
  SELECT id FROM financial_transactions WHERE paypal_event_code IN ('T0300', 'T0400')
);

CREATE INDEX ledger_entries_accounting_class_idx
  ON ledger_entries (accounting_class, transaction_date DESC);
