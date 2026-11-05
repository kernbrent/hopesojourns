ALTER TABLE users ADD COLUMN list_view TEXT NOT NULL DEFAULT 'expanded' CHECK(list_view IN ('expanded','collapsed'));
CREATE TABLE post_hearts (
 post_id TEXT NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
 user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 created_at INTEGER NOT NULL, PRIMARY KEY(post_id,user_id)
);
CREATE INDEX post_hearts_user ON post_hearts(user_id,post_id);
CREATE TABLE resource_thumbs (
 resource_id TEXT NOT NULL REFERENCES resources(id) ON DELETE CASCADE,
 user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 created_at INTEGER NOT NULL, PRIMARY KEY(resource_id,user_id)
);
CREATE INDEX resource_thumbs_user ON resource_thumbs(user_id,resource_id);
