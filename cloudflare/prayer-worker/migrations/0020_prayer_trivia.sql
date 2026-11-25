CREATE TABLE trivia_attempts (
 id TEXT PRIMARY KEY,
 user_id TEXT NOT NULL REFERENCES users(id),
 edition TEXT NOT NULL,
 round INTEGER NOT NULL CHECK(round IN (1,2)),
 display_name TEXT NOT NULL,
 state TEXT NOT NULL,
 revision INTEGER NOT NULL DEFAULT 0,
 completed_at INTEGER,
 expires_at INTEGER NOT NULL
);
CREATE INDEX trivia_attempt_owner ON trivia_attempts(user_id,expires_at);
CREATE TABLE trivia_results (
 attempt_id TEXT PRIMARY KEY,
 user_id TEXT NOT NULL REFERENCES users(id),
 edition TEXT NOT NULL,
 round INTEGER NOT NULL CHECK(round IN (1,2)),
 display_name TEXT NOT NULL,
 score INTEGER NOT NULL CHECK(score BETWEEN 0 AND 100),
 completed_at INTEGER NOT NULL,
 UNIQUE(user_id,edition,round)
);
CREATE INDEX trivia_ranking ON trivia_results(edition,round,score DESC);
