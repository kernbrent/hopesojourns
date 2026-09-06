PRAGMA foreign_keys = ON;

-- Actual departures are intentionally separate from the reusable public
-- opportunity catalog. One opportunity can have many dated trips.
CREATE TABLE trips (
  id TEXT PRIMARY KEY,
  opportunity_id TEXT REFERENCES opportunities(id) ON DELETE SET NULL,
  code TEXT NOT NULL UNIQUE,
  slug TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  subtitle TEXT,
  location TEXT NOT NULL,
  start_date TEXT,
  end_date TEXT,
  status TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'recruiting', 'confirmed', 'full', 'traveling', 'completed', 'archived', 'canceled')),
  capacity INTEGER CHECK (capacity IS NULL OR capacity > 0),
  public_summary TEXT,
  public_description TEXT,
  public_call_to_action TEXT,
  public_enabled INTEGER NOT NULL DEFAULT 0 CHECK (public_enabled IN (0, 1)),
  interest_enabled INTEGER NOT NULL DEFAULT 0 CHECK (interest_enabled IN (0, 1)),
  portal_enabled INTEGER NOT NULL DEFAULT 0 CHECK (portal_enabled IN (0, 1)),
  portal_login_id TEXT UNIQUE,
  portal_password_salt TEXT,
  portal_password_hash TEXT,
  portal_password_iterations INTEGER,
  portal_updated_at TEXT,
  created_by_session_id TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  CHECK (
    (portal_password_hash IS NULL AND portal_password_salt IS NULL AND portal_password_iterations IS NULL)
    OR
    (portal_password_hash IS NOT NULL AND portal_password_salt IS NOT NULL AND portal_password_iterations IS NOT NULL)
  )
);

CREATE INDEX trips_opportunity_status_idx ON trips (opportunity_id, status, start_date);
CREATE INDEX trips_public_idx ON trips (public_enabled, status, start_date);

CREATE TABLE trip_organizations (
  trip_id TEXT NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
  ministry_id TEXT NOT NULL REFERENCES ministries(id) ON DELETE RESTRICT,
  role TEXT NOT NULL,
  notes TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (trip_id, ministry_id, role)
);

CREATE INDEX trip_organizations_ministry_idx ON trip_organizations (ministry_id, trip_id);

CREATE TABLE trip_members (
  trip_id TEXT NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
  person_id TEXT NOT NULL REFERENCES people(id) ON DELETE RESTRICT,
  ministry_id TEXT REFERENCES ministries(id) ON DELETE SET NULL,
  role TEXT NOT NULL DEFAULT 'traveler'
    CHECK (role IN ('traveler', 'leader', 'staff', 'host', 'other')),
  status TEXT NOT NULL DEFAULT 'invited'
    CHECK (status IN ('interested', 'invited', 'applied', 'approved', 'confirmed', 'waitlisted', 'withdrawn')),
  directory_visible INTEGER NOT NULL DEFAULT 1 CHECK (directory_visible IN (0, 1)),
  directory_email_visible INTEGER NOT NULL DEFAULT 0 CHECK (directory_email_visible IN (0, 1)),
  directory_phone_visible INTEGER NOT NULL DEFAULT 0 CHECK (directory_phone_visible IN (0, 1)),
  notes TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (trip_id, person_id)
);

CREATE INDEX trip_members_person_idx ON trip_members (person_id, trip_id);
CREATE INDEX trip_members_status_idx ON trip_members (trip_id, status, role);

CREATE TABLE trip_content (
  id TEXT PRIMARY KEY,
  trip_id TEXT NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
  content_type TEXT NOT NULL
    CHECK (content_type IN ('overview', 'devotional', 'instruction', 'itinerary', 'resource', 'update')),
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  event_date TEXT,
  event_time TEXT,
  location TEXT,
  link_url TEXT,
  visibility TEXT NOT NULL DEFAULT 'travelers'
    CHECK (visibility IN ('public', 'travelers', 'admin')),
  publication_status TEXT NOT NULL DEFAULT 'draft'
    CHECK (publication_status IN ('draft', 'published')),
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX trip_content_portal_idx ON trip_content (trip_id, visibility, publication_status, content_type, sort_order);

CREATE TABLE trip_funding_sources (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  name_normalized TEXT NOT NULL UNIQUE,
  source_type TEXT NOT NULL DEFAULT 'other'
    CHECK (source_type IN ('traveler', 'hope_sojourns', 'church_ministry', 'individual_sponsor', 'external_partner', 'grant', 'other')),
  person_id TEXT REFERENCES people(id) ON DELETE SET NULL,
  ministry_id TEXT REFERENCES ministries(id) ON DELETE SET NULL,
  contact_name TEXT,
  email TEXT,
  phone TEXT,
  notes TEXT,
  default_payment_method TEXT,
  system_key TEXT UNIQUE,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX trip_funding_sources_status_name_idx ON trip_funding_sources (status, name_normalized);

INSERT INTO trip_funding_sources (
  id, name, name_normalized, source_type, system_key, status, created_at, updated_at
) VALUES
  ('source-traveler-self', 'Traveler / Self', 'traveler / self', 'traveler', 'traveler_self', 'active', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('source-hs-general', 'Hope Sojourns General Funds', 'hope sojourns general funds', 'hope_sojourns', 'hs_general', 'active', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('source-hs-leader', 'Hope Sojourns Leader Support', 'hope sojourns leader support', 'hope_sojourns', 'hs_leader_support', 'active', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('source-hs-scholarship', 'Hope Sojourns Scholarship Fund', 'hope sojourns scholarship fund', 'hope_sojourns', 'hs_scholarship', 'active', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('source-church-sponsor', 'Church / Ministry Sponsor', 'church / ministry sponsor', 'church_ministry', 'church_sponsor', 'active', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('source-individual-sponsor', 'Individual Sponsor', 'individual sponsor', 'individual_sponsor', 'individual_sponsor', 'active', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('source-external-partner', 'External Partner', 'external partner', 'external_partner', 'external_partner', 'active', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('source-grant', 'Grant', 'grant', 'grant', 'grant', 'active', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('source-other', 'Other', 'other', 'other', 'other', 'active', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);

CREATE TABLE trip_cost_categories (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  name_normalized TEXT NOT NULL UNIQUE,
  description TEXT,
  system_key TEXT UNIQUE,
  sort_order INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

INSERT INTO trip_cost_categories (
  id, name, name_normalized, system_key, sort_order, status, created_at, updated_at
) VALUES
  ('category-airfare', 'Airfare', 'airfare', 'airfare', 10, 'active', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('category-ground', 'Ground Transportation', 'ground transportation', 'ground_transportation', 20, 'active', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('category-lodging', 'Lodging', 'lodging', 'lodging', 30, 'active', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('category-meals', 'Meals', 'meals', 'meals', 40, 'active', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('category-ministry-donation', 'Onsite Ministry Donation', 'onsite ministry donation', 'onsite_ministry_donation', 50, 'active', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('category-insurance', 'Travel Insurance', 'travel insurance', 'travel_insurance', 60, 'active', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('category-visas', 'Visas and Government Fees', 'visas and government fees', 'visas_government_fees', 70, 'active', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('category-supplies', 'Supplies', 'supplies', 'supplies', 80, 'active', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('category-hs-leadership', 'Hope Sojourns Leadership Expenses', 'hope sojourns leadership expenses', 'hs_leadership', 90, 'active', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('category-hs-admin', 'Hope Sojourns Administration / Overhead', 'hope sojourns administration / overhead', 'hs_administration', 100, 'active', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('category-contingency', 'Contingency', 'contingency', 'contingency', 110, 'active', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('category-other', 'Other', 'other', 'other', 120, 'active', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);

CREATE TABLE trip_accounts (
  id TEXT PRIMARY KEY,
  trip_id TEXT NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
  account_type TEXT NOT NULL
    CHECK (account_type IN ('individual', 'family', 'group', 'organization', 'sponsor')),
  name TEXT NOT NULL,
  person_id TEXT REFERENCES people(id) ON DELETE SET NULL,
  ministry_id TEXT REFERENCES ministries(id) ON DELETE SET NULL,
  billing_email TEXT,
  billing_phone TEXT,
  financial_access TEXT NOT NULL DEFAULT 'private_link'
    CHECK (financial_access IN ('private_link', 'email_only', 'disabled')),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'closed', 'canceled')),
  notes TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX trip_accounts_trip_status_idx ON trip_accounts (trip_id, status, name);
CREATE INDEX trip_accounts_person_idx ON trip_accounts (person_id, trip_id);
CREATE INDEX trip_accounts_ministry_idx ON trip_accounts (ministry_id, trip_id);

CREATE TABLE trip_account_members (
  account_id TEXT NOT NULL REFERENCES trip_accounts(id) ON DELETE CASCADE,
  person_id TEXT NOT NULL REFERENCES people(id) ON DELETE RESTRICT,
  created_at TEXT NOT NULL,
  PRIMARY KEY (account_id, person_id)
);

CREATE INDEX trip_account_members_person_idx ON trip_account_members (person_id, account_id);

CREATE TABLE trip_cost_items (
  id TEXT PRIMARY KEY,
  trip_id TEXT NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
  category_id TEXT NOT NULL REFERENCES trip_cost_categories(id) ON DELETE RESTRICT,
  description TEXT NOT NULL,
  expense_scope TEXT NOT NULL DEFAULT 'trip'
    CHECK (expense_scope IN ('trip', 'group', 'individual')),
  account_id TEXT REFERENCES trip_accounts(id) ON DELETE SET NULL,
  quantity REAL NOT NULL DEFAULT 1 CHECK (quantity > 0),
  estimated_unit_cost REAL NOT NULL DEFAULT 0 CHECK (estimated_unit_cost >= 0),
  estimated_total REAL NOT NULL DEFAULT 0 CHECK (estimated_total >= 0),
  actual_total REAL NOT NULL DEFAULT 0 CHECK (actual_total >= 0),
  vendor_name TEXT,
  vendor_ministry_id TEXT REFERENCES ministries(id) ON DELETE SET NULL,
  settlement_route TEXT NOT NULL DEFAULT 'through_hs'
    CHECK (settlement_route IN ('through_hs', 'external')),
  payment_status TEXT NOT NULL DEFAULT 'planned'
    CHECK (payment_status IN ('planned', 'committed', 'partially_paid', 'paid', 'canceled')),
  payment_method TEXT,
  external_reference TEXT,
  due_date TEXT,
  paid_date TEXT,
  ledger_entry_id TEXT REFERENCES ledger_entries(id) ON DELETE SET NULL,
  notes TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX trip_cost_items_trip_idx ON trip_cost_items (trip_id, payment_status, category_id);

CREATE TABLE trip_cost_allocations (
  id TEXT PRIMARY KEY,
  cost_item_id TEXT NOT NULL REFERENCES trip_cost_items(id) ON DELETE CASCADE,
  funding_source_id TEXT NOT NULL REFERENCES trip_funding_sources(id) ON DELETE RESTRICT,
  amount REAL NOT NULL CHECK (amount > 0),
  status TEXT NOT NULL DEFAULT 'planned'
    CHECK (status IN ('planned', 'confirmed', 'paid', 'canceled')),
  notes TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX trip_cost_allocations_item_idx ON trip_cost_allocations (cost_item_id, status);
CREATE INDEX trip_cost_allocations_source_idx ON trip_cost_allocations (funding_source_id, status);

CREATE TABLE trip_charges (
  id TEXT PRIMARY KEY,
  trip_id TEXT NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
  account_id TEXT NOT NULL REFERENCES trip_accounts(id) ON DELETE CASCADE,
  cost_item_id TEXT REFERENCES trip_cost_items(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  purpose TEXT NOT NULL DEFAULT 'trip_payment'
    CHECK (purpose IN ('trip_payment', 'admin_fee', 'other')),
  amount REAL NOT NULL CHECK (amount > 0),
  due_date TEXT,
  status TEXT NOT NULL DEFAULT 'open'
    CHECK (status IN ('open', 'partially_paid', 'paid', 'waived', 'canceled')),
  notes TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX trip_charges_account_idx ON trip_charges (account_id, status, due_date);
CREATE INDEX trip_charges_trip_idx ON trip_charges (trip_id, status, due_date);

CREATE TABLE trip_coverage_awards (
  id TEXT PRIMARY KEY,
  trip_id TEXT NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
  account_id TEXT NOT NULL REFERENCES trip_accounts(id) ON DELETE CASCADE,
  funding_source_id TEXT NOT NULL REFERENCES trip_funding_sources(id) ON DELETE RESTRICT,
  award_type TEXT NOT NULL
    CHECK (award_type IN ('leader_support', 'scholarship', 'sponsor_credit', 'fee_waiver', 'other')),
  amount REAL NOT NULL CHECK (amount > 0),
  award_date TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'approved'
    CHECK (status IN ('pending', 'approved', 'reversed')),
  reason TEXT,
  approved_by_session_id TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX trip_coverage_awards_account_idx ON trip_coverage_awards (account_id, status, award_date);

CREATE TABLE trip_payments (
  id TEXT PRIMARY KEY,
  trip_id TEXT NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
  account_id TEXT REFERENCES trip_accounts(id) ON DELETE SET NULL,
  funding_source_id TEXT REFERENCES trip_funding_sources(id) ON DELETE SET NULL,
  transaction_date TEXT NOT NULL,
  amount REAL NOT NULL CHECK (amount > 0),
  purpose TEXT NOT NULL DEFAULT 'trip_payment'
    CHECK (purpose IN ('donation', 'trip_payment', 'admin_fee', 'scholarship_contribution', 'refund', 'other')),
  payment_method TEXT NOT NULL,
  settlement_route TEXT NOT NULL DEFAULT 'through_hs'
    CHECK (settlement_route IN ('through_hs', 'external')),
  status TEXT NOT NULL DEFAULT 'received'
    CHECK (status IN ('pending', 'received', 'refunded', 'voided')),
  payer_name TEXT,
  external_reference TEXT,
  source_system TEXT NOT NULL DEFAULT 'manual'
    CHECK (source_system IN ('manual', 'csm', 'paypal', 'venmo', 'import', 'other')),
  source_transaction_id TEXT,
  ledger_entry_id TEXT REFERENCES ledger_entries(id) ON DELETE SET NULL,
  charitable_amount REAL NOT NULL DEFAULT 0 CHECK (charitable_amount >= 0 AND charitable_amount <= amount),
  notes TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (source_system, source_transaction_id)
);

CREATE INDEX trip_payments_account_idx ON trip_payments (account_id, status, transaction_date);
CREATE INDEX trip_payments_trip_idx ON trip_payments (trip_id, status, transaction_date);

CREATE TABLE trip_payment_applications (
  payment_id TEXT NOT NULL REFERENCES trip_payments(id) ON DELETE CASCADE,
  charge_id TEXT NOT NULL REFERENCES trip_charges(id) ON DELETE CASCADE,
  amount REAL NOT NULL CHECK (amount > 0),
  created_at TEXT NOT NULL,
  PRIMARY KEY (payment_id, charge_id)
);

CREATE INDEX trip_payment_applications_charge_idx ON trip_payment_applications (charge_id, payment_id);

CREATE TABLE trip_payment_requests (
  id TEXT PRIMARY KEY,
  trip_id TEXT NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
  account_id TEXT NOT NULL REFERENCES trip_accounts(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  message TEXT,
  amount_requested REAL NOT NULL CHECK (amount_requested > 0),
  due_date TEXT,
  status TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'ready', 'sent', 'partially_paid', 'paid', 'canceled')),
  public_reference TEXT NOT NULL UNIQUE,
  sent_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX trip_payment_requests_account_idx ON trip_payment_requests (account_id, status, due_date);

CREATE TABLE trip_account_access_tokens (
  id TEXT PRIMARY KEY,
  account_id TEXT NOT NULL REFERENCES trip_accounts(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  expires_at TEXT NOT NULL,
  revoked_at TEXT,
  last_used_at TEXT,
  created_at TEXT NOT NULL
);

CREATE INDEX trip_account_access_tokens_account_idx ON trip_account_access_tokens (account_id, expires_at);

CREATE TABLE trip_portal_sessions (
  id TEXT PRIMARY KEY,
  trip_id TEXT NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  expires_at TEXT NOT NULL,
  last_seen_at TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE INDEX trip_portal_sessions_trip_idx ON trip_portal_sessions (trip_id, expires_at);

CREATE TABLE trip_portal_login_attempts (
  key_hash TEXT PRIMARY KEY,
  failure_count INTEGER NOT NULL,
  window_started_at TEXT NOT NULL,
  blocked_until TEXT,
  updated_at TEXT NOT NULL
);

CREATE TABLE trip_invites (
  id TEXT PRIMARY KEY,
  trip_id TEXT NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
  ministry_id TEXT REFERENCES ministries(id) ON DELETE SET NULL,
  label TEXT,
  token_hash TEXT NOT NULL UNIQUE,
  expires_at TEXT,
  max_uses INTEGER CHECK (max_uses IS NULL OR max_uses > 0),
  use_count INTEGER NOT NULL DEFAULT 0 CHECK (use_count >= 0),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'expired', 'revoked')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX trip_invites_trip_idx ON trip_invites (trip_id, status, expires_at);

CREATE TABLE trip_interests (
  id TEXT PRIMARY KEY,
  trip_id TEXT NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
  person_id TEXT NOT NULL REFERENCES people(id) ON DELETE RESTRICT,
  submission_id TEXT REFERENCES interest_submissions(id) ON DELETE SET NULL,
  invite_id TEXT REFERENCES trip_invites(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'interested'
    CHECK (status IN ('interested', 'invited', 'registration_submitted', 'approved', 'confirmed', 'waitlisted', 'declined', 'withdrawn')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (trip_id, person_id)
);

CREATE INDEX trip_interests_status_idx ON trip_interests (trip_id, status, created_at);

CREATE TABLE trip_message_outbox (
  id TEXT PRIMARY KEY,
  trip_id TEXT NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
  account_id TEXT REFERENCES trip_accounts(id) ON DELETE SET NULL,
  payment_request_id TEXT REFERENCES trip_payment_requests(id) ON DELETE SET NULL,
  recipient_email TEXT NOT NULL,
  subject TEXT NOT NULL,
  body_text TEXT NOT NULL,
  message_type TEXT NOT NULL
    CHECK (message_type IN ('invitation', 'payment_request', 'statement', 'trip_update', 'other')),
  status TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'queued', 'sent', 'failed', 'canceled')),
  provider_message_id TEXT,
  last_error TEXT,
  sent_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX trip_message_outbox_status_idx ON trip_message_outbox (status, created_at);

ALTER TABLE ledger_entries ADD COLUMN transaction_purpose TEXT NOT NULL DEFAULT 'general'
  CHECK (transaction_purpose IN ('donation', 'trip_payment', 'admin_fee', 'scholarship_contribution', 'refund', 'trip_expense', 'reimbursement', 'general', 'other'));
ALTER TABLE ledger_entries ADD COLUMN charitable_amount REAL NOT NULL DEFAULT 0 CHECK (charitable_amount >= 0);
ALTER TABLE ledger_entries ADD COLUMN trip_id TEXT REFERENCES trips(id) ON DELETE SET NULL;
ALTER TABLE ledger_entries ADD COLUMN trip_account_id TEXT REFERENCES trip_accounts(id) ON DELETE SET NULL;
ALTER TABLE ledger_entries ADD COLUMN funding_source_id TEXT REFERENCES trip_funding_sources(id) ON DELETE SET NULL;

UPDATE ledger_entries
SET transaction_purpose = 'donation',
    charitable_amount = CASE WHEN gross IS NOT NULL AND gross > 0 THEN gross ELSE amount END
WHERE entry_type = 'income';

CREATE INDEX ledger_entries_trip_idx ON ledger_entries (trip_id, transaction_date DESC);
CREATE INDEX ledger_entries_purpose_idx ON ledger_entries (transaction_purpose, transaction_date DESC);

PRAGMA optimize;
