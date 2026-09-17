PRAGMA foreign_keys = ON;
ALTER TABLE trip_cost_items ADD COLUMN budget_group TEXT NOT NULL DEFAULT 'traveler' CHECK (budget_group IN ('traveler','hs','ministry'));
ALTER TABLE trip_cost_items ADD COLUMN travel_eligible INTEGER NOT NULL DEFAULT 0 CHECK (travel_eligible IN (0,1));
ALTER TABLE trip_cost_items ADD COLUMN needs_estimate INTEGER NOT NULL DEFAULT 0 CHECK (needs_estimate IN (0,1));
ALTER TABLE trip_cost_items ADD COLUMN bill_to_traveler INTEGER NOT NULL DEFAULT 1 CHECK (bill_to_traveler IN (0,1));
ALTER TABLE trip_cost_items ADD COLUMN template_key TEXT;
CREATE UNIQUE INDEX trip_template_item ON trip_cost_items(trip_id,template_key) WHERE template_key IS NOT NULL;
ALTER TABLE trip_charges ADD COLUMN budget_managed INTEGER NOT NULL DEFAULT 0;
CREATE UNIQUE INDEX trip_budget_charge ON trip_charges(account_id,cost_item_id) WHERE budget_managed = 1;
ALTER TABLE trip_accounts ADD COLUMN payment_plan TEXT NOT NULL DEFAULT 'multiple_sources' CHECK(payment_plan IN ('multiple_sources','self_funded'));
ALTER TABLE trip_accounts ADD COLUMN auto_budget INTEGER NOT NULL DEFAULT 0;
CREATE UNIQUE INDEX trip_auto_account ON trip_accounts(trip_id,person_id) WHERE auto_budget=1;
CREATE TABLE ministry_operations (
  id TEXT PRIMARY KEY, created_at TEXT NOT NULL
);
CREATE TRIGGER ministry_charge_update_guard BEFORE UPDATE OF amount,status ON trip_charges
WHEN (ROUND(NEW.amount*100) < ROUND((COALESCE((SELECT SUM(amount) FROM trip_payment_applications WHERE charge_id=OLD.id),0)+COALESCE((SELECT SUM(a.amount) FROM trip_award_applications a JOIN trip_coverage_awards w ON w.id=a.award_id WHERE a.charge_id=OLD.id AND w.status='approved'),0))*100))
OR (NEW.status IN ('waived','canceled') AND (EXISTS(SELECT 1 FROM trip_payment_applications WHERE charge_id=OLD.id) OR EXISTS(SELECT 1 FROM trip_award_applications WHERE charge_id=OLD.id)))
BEGIN SELECT RAISE(ABORT,'Resolve allocated funding before reducing or canceling a charge'); END;
CREATE TABLE ministry_documents (
  id TEXT PRIMARY KEY, title TEXT NOT NULL, category TEXT NOT NULL,
  trip_id TEXT REFERENCES trips(id) ON DELETE SET NULL,
  deleted_at TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL
);
CREATE TABLE ministry_document_versions (
  id TEXT PRIMARY KEY, document_id TEXT NOT NULL REFERENCES ministry_documents(id) ON DELETE CASCADE,
  object_key TEXT NOT NULL UNIQUE, filename TEXT NOT NULL, media_type TEXT NOT NULL,
  file_size INTEGER NOT NULL, created_at TEXT NOT NULL
);
CREATE INDEX ministry_document_version_date ON ministry_document_versions(document_id,created_at);
CREATE TABLE ministry_events (
  id TEXT PRIMARY KEY, event_key TEXT NOT NULL UNIQUE, title TEXT NOT NULL,
  detail TEXT NOT NULL, action_url TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'action'
    CHECK(status IN ('action','activity','completed')),
  created_at TEXT NOT NULL, resolved_at TEXT
);
CREATE TABLE trip_award_applications (
  award_id TEXT NOT NULL REFERENCES trip_coverage_awards(id) ON DELETE RESTRICT,
  charge_id TEXT NOT NULL REFERENCES trip_charges(id) ON DELETE RESTRICT,
  amount REAL NOT NULL CHECK(amount > 0), PRIMARY KEY(award_id,charge_id)
);
-- Abort the entire batch if a concurrent allocation would overpay a charge.
CREATE TRIGGER ministry_payment_application_guard BEFORE INSERT ON trip_payment_applications
BEGIN
 SELECT CASE WHEN NOT EXISTS (
   SELECT 1 FROM trip_charges c JOIN trip_payments p ON p.id=NEW.payment_id
   WHERE c.id=NEW.charge_id AND c.account_id=p.account_id AND c.trip_id=p.trip_id
     AND c.status NOT IN ('waived','canceled') AND p.status='received'
     AND p.purpose IN ('trip_payment','admin_fee','other')
     AND ROUND((COALESCE((SELECT SUM(a.amount) FROM trip_payment_applications a WHERE a.charge_id=c.id),0)
       + COALESCE((SELECT SUM(a.amount) FROM trip_award_applications a JOIN trip_coverage_awards w ON w.id=a.award_id WHERE a.charge_id=c.id AND w.status='approved'),0)
       + NEW.amount)*100) <= ROUND(c.amount*100)
     AND ROUND((COALESCE((SELECT SUM(a.amount) FROM trip_payment_applications a WHERE a.payment_id=p.id),0)+NEW.amount)*100)<=ROUND(p.amount*100)
 ) THEN RAISE(ABORT,'Payment allocation exceeds available balance or has an invalid account') END;
END;
CREATE TRIGGER ministry_award_application_guard BEFORE INSERT ON trip_award_applications
BEGIN
 SELECT CASE WHEN NOT EXISTS (
   SELECT 1 FROM trip_charges c JOIN trip_coverage_awards w ON w.id=NEW.award_id
   WHERE c.id=NEW.charge_id AND c.account_id=w.account_id AND c.trip_id=w.trip_id
     AND c.status NOT IN ('waived','canceled') AND w.status='approved'
     AND ROUND((COALESCE((SELECT SUM(a.amount) FROM trip_payment_applications a WHERE a.charge_id=c.id),0)
       + COALESCE((SELECT SUM(a.amount) FROM trip_award_applications a JOIN trip_coverage_awards x ON x.id=a.award_id WHERE a.charge_id=c.id AND x.status='approved'),0)
       + NEW.amount)*100)<=ROUND(c.amount*100)
     AND ROUND((COALESCE((SELECT SUM(a.amount) FROM trip_award_applications a WHERE a.award_id=w.id),0)+NEW.amount)*100)<=ROUND(w.amount*100)
 ) THEN RAISE(ABORT,'Support allocation exceeds available balance or has an invalid account') END;
END;
