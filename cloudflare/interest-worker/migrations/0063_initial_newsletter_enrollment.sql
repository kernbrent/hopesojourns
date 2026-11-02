-- One-time, user-requested enrollment at release. Does not send email.
-- Applied independently to test and production contacts; never copies contacts.
-- Unknown country is eligible; a recorded non-US country or missing email is not.
-- Partial names exclude matching first names, except James Bryant is explicitly eligible.
-- James is excluded only when the surname is unrecorded or an unknown placeholder.
CREATE TABLE newsletter_release_audience AS
SELECT id AS person_id,
 CASE
  WHEN trim(COALESCE(email,''),char(9)||char(10)||char(13)||' ')='' THEN 'missing_email'
  WHEN lower(trim(COALESCE(country,''))) NOT IN ('','usa','us','u.s.','u.s.a.','united states','united states of america') THEN 'outside_us'
  WHEN lower(trim(first_name)) IN ('ahrmad','ahmad','ahmed','moises','moisés','nassus','nassos','nasos') THEN 'excluded_first_name'
  WHEN lower(trim(first_name))='james' AND lower(trim(COALESCE(last_name,''))) IN ('','???','unknown') THEN 'excluded_first_name'
  WHEN lower(trim(first_name))='artur' AND lower(replace(trim(last_name),'Ç','c')) IN ('cipllaka','çipllaka') THEN 'excluded_named_contact'
  WHEN lower(trim(first_name))='dimitris' AND lower(trim(last_name))='kontopoulos' THEN 'excluded_named_contact'
  ELSE NULL
 END AS exclusion_reason
FROM people;

INSERT INTO audit_events(id,entity_type,entity_id,event_type,metadata_json,created_at)
SELECT lower(hex(randomblob(16))),'person',a.person_id,'newsletter_initial_enrollment',
 json_object('source','0063_initial_newsletter_enrollment','change','added'),strftime('%Y-%m-%dT%H:%M:%fZ','now')
FROM newsletter_release_audience a WHERE a.exclusion_reason IS NULL
AND NOT EXISTS(SELECT 1 FROM contact_types t WHERE t.person_id=a.person_id AND t.contact_type='newsletter');

INSERT INTO audit_events(id,entity_type,entity_id,event_type,metadata_json,created_at)
SELECT lower(hex(randomblob(16))),'person',a.person_id,'newsletter_initial_enrollment',
 json_object('source','0063_initial_newsletter_enrollment','change','removed','reason',a.exclusion_reason),strftime('%Y-%m-%dT%H:%M:%fZ','now')
FROM newsletter_release_audience a WHERE a.exclusion_reason IS NOT NULL
AND EXISTS(SELECT 1 FROM contact_types t WHERE t.person_id=a.person_id AND t.contact_type='newsletter');

INSERT OR IGNORE INTO contact_types(person_id,contact_type,created_at)
SELECT person_id,'newsletter',strftime('%Y-%m-%dT%H:%M:%fZ','now')
FROM newsletter_release_audience WHERE exclusion_reason IS NULL;

DELETE FROM contact_types WHERE contact_type='newsletter' AND person_id IN
 (SELECT person_id FROM newsletter_release_audience WHERE exclusion_reason IS NOT NULL);

DROP TABLE newsletter_release_audience;
