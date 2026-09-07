PRAGMA foreign_keys = ON;

-- Budget planning is kept on the dated trip so the workflow can distinguish
-- "costs have been entered" from "the administrator finished reviewing them."
ALTER TABLE trips ADD COLUMN paying_traveler_count INTEGER NOT NULL DEFAULT 1
  CHECK (paying_traveler_count BETWEEN 1 AND 100000);
ALTER TABLE trips ADD COLUMN budget_completed_at TEXT;

-- Existing costs keep their original fixed calculation. New costs may be
-- multiplied per paying traveler or derived as a percentage of the individual
-- base budget. Percentage rows are limited by the application to the HS
-- leadership and administration categories.
ALTER TABLE trip_cost_items ADD COLUMN calculation_method TEXT NOT NULL DEFAULT 'fixed'
  CHECK (calculation_method IN ('fixed', 'per_traveler', 'percentage_of_individual'));
ALTER TABLE trip_cost_items ADD COLUMN percentage_rate REAL
  CHECK (percentage_rate IS NULL OR (percentage_rate >= 0 AND percentage_rate <= 100));
