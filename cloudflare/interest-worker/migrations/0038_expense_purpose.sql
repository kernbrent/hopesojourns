ALTER TABLE finance_review ADD COLUMN expense_purpose TEXT
  CHECK (expense_purpose IS NULL OR expense_purpose IN ('operations','outreach','trip','ministry_support'));

-- Existing records deliberately remain unclassified. Only new ordinary expenses default.
CREATE TRIGGER finance_new_expense_purpose AFTER INSERT ON ledger_entries
WHEN NEW.entry_type='expense' AND NEW.accounting_class='operating'
 AND NEW.trip_id IS NULL AND NEW.transaction_purpose<>'trip_expense'
BEGIN
 INSERT INTO finance_review(ledger_id,status,expense_purpose,updated_at)
 VALUES(NEW.id,'included','operations',NEW.updated_at);
END;

CREATE TRIGGER finance_planned_trip_insert BEFORE INSERT ON finance_review
WHEN NEW.expense_purpose='trip' AND NOT EXISTS (
 SELECT 1 FROM trips WHERE id=NEW.trip_id AND status IN ('draft','recruiting','confirmed','full'))
 AND NOT EXISTS (SELECT 1 FROM finance_review WHERE ledger_id=NEW.ledger_id
  AND expense_purpose='trip' AND trip_id=NEW.trip_id)
BEGIN SELECT RAISE(ABORT,'Choose a planned trip for this expense.'); END;

CREATE TRIGGER finance_planned_trip_update BEFORE UPDATE OF expense_purpose,trip_id ON finance_review
WHEN NEW.expense_purpose='trip'
 AND (OLD.expense_purpose IS NOT NEW.expense_purpose OR OLD.trip_id IS NOT NEW.trip_id)
 AND NOT EXISTS (SELECT 1 FROM trips WHERE id=NEW.trip_id AND status IN ('draft','recruiting','confirmed','full'))
BEGIN SELECT RAISE(ABORT,'Choose a planned trip for this expense.'); END;
