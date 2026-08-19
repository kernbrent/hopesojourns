CREATE TRIGGER trip_registrations_trip_only_insert
BEFORE INSERT ON trip_registrations
WHEN COALESCE((SELECT kind FROM opportunities WHERE id = NEW.opportunity_id), '') <> 'trip'
BEGIN
  SELECT RAISE(ABORT, 'Trip registrations require a trip opportunity');
END;
CREATE TRIGGER trip_registrations_trip_only_update
BEFORE UPDATE OF opportunity_id ON trip_registrations
WHEN COALESCE((SELECT kind FROM opportunities WHERE id = NEW.opportunity_id), '') <> 'trip'
BEGIN
  SELECT RAISE(ABORT, 'Trip registrations require a trip opportunity');
END;
