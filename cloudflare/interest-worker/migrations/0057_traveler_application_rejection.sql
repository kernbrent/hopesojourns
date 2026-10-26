-- Reject an invalid application independently of traveler suitability or trip membership.
ALTER TABLE traveler_applications ADD COLUMN rejected_at TEXT;
ALTER TABLE traveler_applications ADD COLUMN rejection_reason TEXT NOT NULL DEFAULT '';
