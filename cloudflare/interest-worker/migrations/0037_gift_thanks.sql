CREATE TABLE gift_thanks_settings (
 id INTEGER PRIMARY KEY CHECK(id=1), automatic INTEGER NOT NULL DEFAULT 0 CHECK(automatic IN(0,1))
);
INSERT INTO gift_thanks_settings VALUES(1,0);
-- Retain send history even if a ledger entry/contact is later removed.
CREATE TABLE gift_thanks (
 entry_id TEXT NOT NULL, person_id TEXT NOT NULL,
 status TEXT NOT NULL CHECK(status IN('sending','sent','failed','uncertain','captured')),
 attempt_key TEXT NOT NULL, payload_json TEXT NOT NULL,
 started_at TEXT NOT NULL, updated_at TEXT NOT NULL, sent_at TEXT,
 provider_id TEXT, error TEXT, actor TEXT NOT NULL,
 PRIMARY KEY(entry_id,person_id)
);
CREATE TRIGGER gift_thanks_protect_split_insert BEFORE INSERT ON donation_splits
 WHEN EXISTS(SELECT 1 FROM gift_thanks WHERE entry_id=NEW.entry_id AND status IN('sending','sent','uncertain'))
 BEGIN SELECT RAISE(ABORT,'A gift acknowledgment already exists; donor allocations cannot change'); END;
CREATE TRIGGER gift_thanks_protect_split_update BEFORE UPDATE ON donation_splits
 WHEN NEW.allocations_json!=OLD.allocations_json AND EXISTS(SELECT 1 FROM gift_thanks WHERE entry_id=NEW.entry_id AND status IN('sending','sent','uncertain'))
 BEGIN SELECT RAISE(ABORT,'A gift acknowledgment already exists; donor allocations cannot change'); END;
