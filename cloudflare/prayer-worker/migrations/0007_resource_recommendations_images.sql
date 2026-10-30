ALTER TABLE resources ADD COLUMN review_status TEXT NOT NULL DEFAULT 'approved' CHECK(review_status IN ('approved','pending','declined'));
ALTER TABLE resources ADD COLUMN submitted_by TEXT REFERENCES users(id);
ALTER TABLE resources ADD COLUMN submitted_at INTEGER;
ALTER TABLE resources ADD COLUMN reviewed_by TEXT REFERENCES users(id);
ALTER TABLE resources ADD COLUMN reviewed_at INTEGER;
ALTER TABLE resources ADD COLUMN image_key TEXT NOT NULL DEFAULT '';
CREATE TABLE resource_images (
 resource_id TEXT PRIMARY KEY REFERENCES resources(id) ON DELETE CASCADE,
 mime TEXT NOT NULL CHECK(mime IN ('image/jpeg','image/png','image/webp')),
 data TEXT NOT NULL
);
CREATE INDEX resource_review_queue ON resources(review_status,submitted_at,id);
UPDATE resources SET image_key='/assets/resource-covers/wild-at-heart.jpg',revision=revision+1 WHERE id='wild-at-heart';
UPDATE resources SET image_key='/assets/resource-covers/not-even-a-hint.jpg',revision=revision+1 WHERE id='not-even-a-hint';
