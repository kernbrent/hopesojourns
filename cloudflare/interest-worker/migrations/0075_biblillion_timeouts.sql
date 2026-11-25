-- Timeout detail is still an anonymous skip; preserve the separate reason for review.
ALTER TABLE biblillion_results ADD COLUMN timed_out INTEGER NOT NULL DEFAULT 0 CHECK(timed_out IN (0,1));
ALTER TABLE biblillion_rounds ADD COLUMN timeouts INTEGER NOT NULL DEFAULT 0;
CREATE TRIGGER biblillion_timeout_insert AFTER INSERT ON biblillion_results WHEN NEW.timed_out=1 BEGIN
 UPDATE biblillion_rounds SET timeouts=timeouts+1 WHERE id=NEW.round_id;
END;
