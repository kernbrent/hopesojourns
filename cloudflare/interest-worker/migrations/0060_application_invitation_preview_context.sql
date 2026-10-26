-- Freeze recipient/address/selection context at preview while retaining idempotent delivery.
ALTER TABLE traveler_application_previews ADD COLUMN context_json TEXT NOT NULL DEFAULT '{}';
ALTER TABLE traveler_application_emails ADD COLUMN context_json TEXT NOT NULL DEFAULT '{}';
