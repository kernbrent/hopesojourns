ALTER TABLE portal_requests ADD COLUMN email_status TEXT NOT NULL DEFAULT 'none' CHECK(email_status IN ('none','sending','sent','captured','failed'));
