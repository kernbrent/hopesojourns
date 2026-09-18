CREATE TABLE donation_splits (
 entry_id TEXT PRIMARY KEY REFERENCES ledger_entries(id) ON DELETE CASCADE,
 revision INTEGER NOT NULL CHECK(revision>0),
 allocations_json TEXT NOT NULL CHECK(json_valid(allocations_json) AND json_type(allocations_json)='array'),
 updated_at TEXT NOT NULL, actor TEXT NOT NULL
);
CREATE TABLE donation_split_history (id INTEGER PRIMARY KEY AUTOINCREMENT,entry_id TEXT NOT NULL,revision INTEGER NOT NULL,allocations_json TEXT NOT NULL,updated_at TEXT NOT NULL,actor TEXT NOT NULL);
CREATE TRIGGER donation_split_validate_insert BEFORE INSERT ON donation_splits BEGIN
 SELECT CASE WHEN json_array_length(NEW.allocations_json)>0 AND (
 json_array_length(NEW.allocations_json) NOT BETWEEN 2 AND 100 OR
 NOT EXISTS(SELECT 1 FROM ledger_entries WHERE id=NEW.entry_id AND entry_type='income' AND charitable_amount>0 AND ROUND(charitable_amount*100)=(SELECT SUM(json_extract(value,'$.amountCents')) FROM json_each(NEW.allocations_json))) OR
 EXISTS(SELECT 1 FROM json_each(NEW.allocations_json) WHERE json_type(value,'$.amountCents') IS NOT 'integer' OR json_extract(value,'$.amountCents')<=0)
 ) THEN RAISE(ABORT,'Invalid donation split total') END;
 END;
CREATE TRIGGER donation_split_history_insert AFTER INSERT ON donation_splits BEGIN
 INSERT INTO donation_split_history(entry_id,revision,allocations_json,updated_at,actor) VALUES(NEW.entry_id,NEW.revision,NEW.allocations_json,NEW.updated_at,NEW.actor);
 END;
CREATE TRIGGER donation_split_validate_update BEFORE UPDATE ON donation_splits BEGIN
 SELECT CASE WHEN json_array_length(NEW.allocations_json)>0 AND (
 json_array_length(NEW.allocations_json) NOT BETWEEN 2 AND 100 OR
 NOT EXISTS(SELECT 1 FROM ledger_entries WHERE id=NEW.entry_id AND entry_type='income' AND charitable_amount>0 AND ROUND(charitable_amount*100)=(SELECT SUM(json_extract(value,'$.amountCents')) FROM json_each(NEW.allocations_json))) OR
 EXISTS(SELECT 1 FROM json_each(NEW.allocations_json) WHERE json_type(value,'$.amountCents') IS NOT 'integer' OR json_extract(value,'$.amountCents')<=0)
 ) THEN RAISE(ABORT,'Invalid donation split total') END;
 END;
CREATE TRIGGER donation_split_history_update AFTER UPDATE ON donation_splits BEGIN
 INSERT INTO donation_split_history(entry_id,revision,allocations_json,updated_at,actor) VALUES(NEW.entry_id,NEW.revision,NEW.allocations_json,NEW.updated_at,NEW.actor);
 END;
CREATE TRIGGER donation_split_protect_parent BEFORE UPDATE ON ledger_entries
 WHEN EXISTS(SELECT 1 FROM donation_splits WHERE entry_id=OLD.id AND json_array_length(allocations_json)>0)
 BEGIN
 SELECT CASE WHEN NOT (NEW.entry_type='income') OR ROUND(NEW.charitable_amount*100) != (SELECT SUM(json_extract(value,'$.amountCents')) FROM donation_splits,json_each(allocations_json) WHERE entry_id=OLD.id) THEN RAISE(ABORT,'Undo donor split before changing its total or type') END;
 END;
CREATE VIEW donation_gifts AS
 SELECT l.id,l.person_id,l.transaction_date,l.charitable_amount,l.payment_type,l.budget_category,l.transaction_purpose,l.note,l.trip_id,l.created_at
 FROM ledger_entries l WHERE l.entry_type='income' AND l.charitable_amount>0 AND NOT EXISTS(SELECT 1 FROM donation_splits s WHERE s.entry_id=l.id AND json_array_length(s.allocations_json)>0)
 UNION ALL
 SELECT l.id,json_extract(a.value,'$.personId'),json_extract(a.value,'$.date'),json_extract(a.value,'$.amountCents')/100.0,l.payment_type,l.budget_category,l.transaction_purpose,json_extract(a.value,'$.note'),l.trip_id,l.created_at
 FROM ledger_entries l JOIN donation_splits s ON s.entry_id=l.id JOIN json_each(s.allocations_json) a;
CREATE TRIGGER donation_split_keep_person BEFORE DELETE ON people WHEN EXISTS(SELECT 1 FROM donation_splits,json_each(allocations_json) WHERE json_extract(value,'$.personId')=OLD.id) BEGIN SELECT RAISE(ABORT,'Person has donation allocations'); END;

CREATE TABLE donation_split_guards(value INTEGER CHECK(value=1));
