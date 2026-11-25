-- Optional, visitor-supplied attribution. source_page remains the technical URL.
ALTER TABLE interest_submissions ADD COLUMN referral_source TEXT
  CHECK (referral_source IS NULL OR referral_source IN ('friend-family','church-ministry','previous-participant','social-media','online-search','event-presentation','other'));
ALTER TABLE interest_submissions ADD COLUMN referral_detail TEXT
  CHECK (referral_detail IS NULL OR (referral_source IS NOT NULL AND length(referral_detail) <= 240));

-- A contact's dated referral history follows its accepted inquiries. Keep one
-- authoritative copy so deleting an inquiry or contact cannot leave stale data.
CREATE VIEW contact_referrals AS
  SELECT id AS submission_id, person_id, referral_source, referral_detail, created_at
  FROM interest_submissions WHERE referral_source IS NOT NULL;
