CREATE TABLE devotionals (
 id TEXT PRIMARY KEY, title TEXT NOT NULL, scripture TEXT NOT NULL, body TEXT NOT NULL,
 reflection TEXT NOT NULL DEFAULT '', prayer TEXT NOT NULL DEFAULT '', publish_date TEXT NOT NULL,
 status TEXT NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','published','hidden')),
 is_sample INTEGER NOT NULL DEFAULT 0 CHECK(is_sample IN (0,1)),
 created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL, revision INTEGER NOT NULL DEFAULT 1
);
CREATE UNIQUE INDEX devotional_published_day ON devotionals(publish_date) WHERE status='published';
CREATE INDEX devotional_listing ON devotionals(status,publish_date DESC,id);
CREATE TABLE devotional_reads (
 devotional_id TEXT NOT NULL REFERENCES devotionals(id) ON DELETE CASCADE,
 user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, read_at INTEGER NOT NULL,
 PRIMARY KEY(devotional_id,user_id)
);
CREATE INDEX devotional_reads_user ON devotional_reads(user_id);
INSERT INTO devotionals VALUES ('rest-for-the-journey','Rest for the journey','Matthew 11:28–30',
'Jesus invites weary people to come to Him. We often approach a new day as though everything depends on our strength, our plans, or our ability to hold life together. His invitation gives us another place to begin: with Him. Rest does not mean ignoring our responsibilities. It means bringing our burdens to the One who meets us with gentleness.

Take a quiet moment before the next task. Name one concern honestly before God. Ask Jesus to show you a faithful next step instead of demanding that you solve the entire road ahead. His presence can steady you even when your circumstances have not changed. Today, practice receiving His care as freely as you offer care to someone else.',
'What burden can you bring to Jesus today? What is one small step of trust you can take?',
'Lord Jesus, meet me in my weariness. Teach me to receive Your rest and walk with You in the responsibilities of this day. Amen.',date('now','-3 days'),'published',1,unixepoch()*1000,unixepoch()*1000,1);
INSERT INTO devotionals VALUES ('carry-one-another','Carry one another','Galatians 6:2',
'Following Jesus brings us into a community where we do not have to carry every burden alone. Sometimes we need to speak honestly about our own needs. At other times, love asks us to slow down and listen to someone whose struggle is different from ours. Both receiving help and offering it can become acts of faith.

You do not need a perfect answer to encourage another person. A thoughtful question, a patient conversation, or a simple prayer can make room for hope. Respect the trust placed in you: keep private stories within the audience that person chose. Ask God to show you one practical way to care today, without trying to take control of another person''s journey.',
'Who could you encourage today? What would it look like to listen before offering advice?',
'Father, open my eyes to the people around me. Give me humility to receive help and wisdom to offer care with kindness and respect. Amen.',date('now','-2 days'),'published',1,unixepoch()*1000,unixepoch()*1000,1);
INSERT INTO devotionals VALUES ('mercies-for-today','Mercies for today','Lamentations 3:22–23',
'The promise of God''s faithfulness does not require us to pretend yesterday was easy. Scripture makes room for grief, disappointment, and uncertainty while pointing us toward God''s enduring mercy. A new morning can be an invitation to begin again with Him, even if some questions remain unanswered.

Before reviewing what went wrong or what still needs to be done, remember one expression of God''s care. It may be the kindness of a friend, strength for a difficult conversation, or a moment of peace. Gratitude does not erase pain, but it can help us notice that pain is not the whole story. Bring today''s needs to God and ask for enough grace to take the next faithful step.',
'Where have you noticed God''s care recently? What do you need His grace for today?',
'Faithful God, thank You for Your mercy. Help me notice Your care, bring You my questions, and begin this day with hope in You. Amen.',date('now','-1 day'),'published',1,unixepoch()*1000,unixepoch()*1000,1);
