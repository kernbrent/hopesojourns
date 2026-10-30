CREATE TABLE resource_categories (
 id TEXT PRIMARY KEY, name TEXT NOT NULL COLLATE NOCASE UNIQUE,
 sort_order INTEGER NOT NULL DEFAULT 0, revision INTEGER NOT NULL DEFAULT 1
);
CREATE TABLE resources (
 id TEXT PRIMARY KEY, category_id TEXT NOT NULL REFERENCES resource_categories(id),
 title TEXT NOT NULL, creator TEXT NOT NULL DEFAULT '', description TEXT NOT NULL DEFAULT '',
 url TEXT NOT NULL DEFAULT '', visible INTEGER NOT NULL DEFAULT 1 CHECK(visible IN (0,1)),
 featured INTEGER NOT NULL DEFAULT 0 CHECK(featured IN (0,1)), sort_order INTEGER NOT NULL DEFAULT 0,
 created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL, revision INTEGER NOT NULL DEFAULT 1
);
CREATE TABLE resource_tags (
 resource_id TEXT NOT NULL REFERENCES resources(id) ON DELETE CASCADE,
 tag TEXT NOT NULL, PRIMARY KEY(resource_id,tag)
);
CREATE INDEX resource_tag_lookup ON resource_tags(tag,resource_id);
CREATE INDEX resource_library_order ON resources(visible,featured DESC,sort_order,title,id);
INSERT INTO resource_categories (id,name,sort_order) VALUES
 ('books','Books',10),('music','Music',20),('sermons','Sermons',30),('articles','Articles',40),
 ('prayers','Prayers',50),('podcasts','Podcasts',60),('videos','Videos',70),('devotionals','Devotionals',80),
 ('bible-studies','Bible studies',90),('courses','Courses',100),('tools','Tools & worksheets',110),('other','Other',120);
INSERT INTO resources (id,category_id,title,creator,description,url,sort_order,created_at,updated_at) VALUES
 ('wild-at-heart','books','Wild at Heart','John Eldredge','A book for reflection on identity, purpose, and the life of faith.','https://wildatheart.org/books/wild-at-heart/',10,1793232000000,1793232000000),
 ('not-even-a-hint','books','Not Even a Hint: Guarding Your Heart Against Lust','Joshua Harris','A book for discussion about temptation, personal boundaries, and accountability.','https://books.google.com/books?vid=ISBN9781590521472',20,1793232000000,1793232000000);
INSERT INTO resource_tags VALUES
 ('wild-at-heart','men'),('wild-at-heart','identity'),('wild-at-heart','spiritual-growth'),
 ('not-even-a-hint','accountability'),('not-even-a-hint','purity'),('not-even-a-hint','temptation');
