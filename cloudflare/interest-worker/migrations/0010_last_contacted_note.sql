ALTER TABLE people
ADD COLUMN last_contacted_note TEXT
CHECK (last_contacted_note IS NULL OR length(last_contacted_note) <= 50);

PRAGMA optimize;
