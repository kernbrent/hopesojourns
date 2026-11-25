-- Opt-in game results are anonymous round records, never contacts or identities.
CREATE TABLE biblillion_rounds (
 id TEXT PRIMARY KEY, bank_version TEXT NOT NULL, round_day TEXT NOT NULL,
 mode TEXT NOT NULL CHECK(mode IN ('daily','practice')), destination_id TEXT NOT NULL,
 started_day TEXT NOT NULL, first_shared_at TEXT NOT NULL, last_shared_at TEXT NOT NULL,
 result_count INTEGER NOT NULL DEFAULT 0, stamps INTEGER NOT NULL DEFAULT 0, base_points INTEGER NOT NULL DEFAULT 0,
 recorded_slots INTEGER NOT NULL DEFAULT 0 CHECK(recorded_slots BETWEEN 0 AND 127)
);
CREATE INDEX biblillion_rounds_day ON biblillion_rounds(started_day,mode,destination_id);
CREATE TABLE biblillion_results (
 id TEXT PRIMARY KEY, request_hash TEXT NOT NULL, round_id TEXT NOT NULL REFERENCES biblillion_rounds(id),
 slot INTEGER NOT NULL CHECK(slot BETWEEN 0 AND 6), question_id TEXT NOT NULL,
 answer TEXT, skipped INTEGER NOT NULL CHECK(skipped IN (0,1)), corrected INTEGER NOT NULL CHECK(corrected IN (0,1)),
 points INTEGER NOT NULL, received_at TEXT NOT NULL,
 UNIQUE(round_id,slot), UNIQUE(round_id,question_id),
 CHECK((skipped=1 AND answer IS NULL AND points=0 AND corrected=0) OR (skipped=0 AND answer IS NOT NULL AND points BETWEEN 35 AND 100))
);
CREATE INDEX biblillion_results_retention ON biblillion_results(received_at);
CREATE TABLE biblillion_answer_counts (
 day TEXT NOT NULL, mode TEXT NOT NULL, destination_id TEXT NOT NULL, bank_version TEXT NOT NULL,
 question_id TEXT NOT NULL, answer_key TEXT NOT NULL, corrected INTEGER NOT NULL,
 total INTEGER NOT NULL DEFAULT 0, points INTEGER NOT NULL DEFAULT 0,
 PRIMARY KEY(day,mode,destination_id,bank_version,question_id,answer_key,corrected)
);
CREATE TRIGGER biblillion_result_insert AFTER INSERT ON biblillion_results BEGIN
 UPDATE biblillion_rounds SET result_count=result_count+1, stamps=stamps+(1-NEW.skipped),
 base_points=base_points+NEW.points,last_shared_at=NEW.received_at,
 recorded_slots=recorded_slots | (1 << NEW.slot) WHERE id=NEW.round_id;
 INSERT INTO biblillion_answer_counts(day,mode,destination_id,bank_version,question_id,answer_key,corrected,total,points)
 SELECT started_day,mode,destination_id,bank_version,NEW.question_id,coalesce(NEW.answer,''),NEW.corrected,1,NEW.points
 FROM biblillion_rounds WHERE id=NEW.round_id
 ON CONFLICT(day,mode,destination_id,bank_version,question_id,answer_key,corrected)
 DO UPDATE SET total=total+1,points=points+NEW.points;
END;
CREATE TABLE biblillion_limits(key TEXT PRIMARY KEY,count INTEGER NOT NULL,expires_at INTEGER NOT NULL);
CREATE TABLE biblillion_devotional_drafts (
 id TEXT PRIMARY KEY, question_id TEXT NOT NULL, destination_id TEXT,
 title TEXT NOT NULL, scripture_ref TEXT NOT NULL, reflection TEXT NOT NULL, prayer TEXT NOT NULL,
 practice TEXT NOT NULL, created_by TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL
);
