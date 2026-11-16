-- Athens team journey rescheduled by Brent on November 16, 2026.
-- Run separately in test and production. No records are copied between environments.
UPDATE destinations
SET dates_text = replace(replace(replace(dates_text,
    'July 10–20', 'July 9–19'), 'July 10-20', 'July 9-19'),
    'July 10 through July 20', 'July 9 through July 19'),
    revision = revision + 1,
    updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')
WHERE slug = 'athens'
  AND (instr(dates_text, 'July 10–20') > 0
    OR instr(dates_text, 'July 10-20') > 0
    OR instr(dates_text, 'July 10 through July 20') > 0);

UPDATE trips
SET start_date = '2027-07-09', end_date = '2027-07-19',
    updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')
WHERE start_date = '2027-07-10' AND end_date = '2027-07-20'
  AND (opportunity_id IN (SELECT id FROM destinations WHERE slug = 'athens')
    OR id IN (SELECT trip_id FROM trip_destinations WHERE destination_id IN (SELECT id FROM destinations WHERE slug = 'athens'))
    OR lower(title) LIKE '%athens%' OR lower(location) LIKE '%athens%');

UPDATE ministries
SET description = replace(replace(replace(description,
    'July 10 through July 20', 'July 9 through July 19'),
    'July 10–20', 'July 9–19'), 'July 10-20', 'July 9-19'),
    updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')
WHERE lower(name) LIKE '%athens%'
  AND (instr(description, 'July 10 through July 20') > 0
    OR instr(description, 'July 10–20') > 0 OR instr(description, 'July 10-20') > 0);
