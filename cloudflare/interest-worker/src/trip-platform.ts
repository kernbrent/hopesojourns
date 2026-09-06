import {
  AdminError,
  adminJson,
  authenticate,
  auditStatement,
  readAdminJson,
  secureEqual,
  type AdminEnv,
} from "./admin";

const PORTAL_SESSION_HOURS = 12;
const ACCOUNT_LINK_DAYS = 30;
const PASSWORD_ITERATIONS = 100_000;
const MONEY_LIMIT = 10_000_000;
const PORTAL_LOGIN_WINDOW_MINUTES = 15;
const PORTAL_LOGIN_MAX_FAILURES = 6;
const PORTAL_LOGIN_BLOCK_MINUTES = 30;
const PORTAL_LOGIN_ATTEMPT_RETENTION_DAYS = 7;

const TRIP_STATUSES = new Set(["draft", "recruiting", "confirmed", "full", "traveling", "completed", "archived", "canceled"]);
const SOURCE_TYPES = new Set(["traveler", "hope_sojourns", "church_ministry", "individual_sponsor", "external_partner", "grant", "other"]);
const CONTENT_TYPES = new Set(["overview", "devotional", "instruction", "itinerary", "resource", "update"]);
const VISIBILITIES = new Set(["public", "travelers", "admin"]);
const MEMBER_ROLES = new Set(["traveler", "leader", "staff", "host", "other"]);
const MEMBER_STATUSES = new Set(["interested", "invited", "applied", "approved", "confirmed", "waitlisted", "withdrawn"]);
const ACCOUNT_TYPES = new Set(["individual", "family", "group", "organization", "sponsor"]);
const FINANCIAL_ACCESS = new Set(["private_link", "email_only", "disabled"]);
const COST_SCOPES = new Set(["trip", "group", "individual"]);
const COST_STATUSES = new Set(["planned", "committed", "partially_paid", "paid", "canceled"]);
const ALLOCATION_STATUSES = new Set(["planned", "confirmed", "paid", "canceled"]);
const SETTLEMENT_ROUTES = new Set(["through_hs", "external"]);
const CHARGE_PURPOSES = new Set(["trip_payment", "admin_fee", "other"]);
const CHARGE_STATUSES = new Set(["open", "partially_paid", "paid", "waived", "canceled"]);
const AWARD_TYPES = new Set(["leader_support", "scholarship", "sponsor_credit", "fee_waiver", "other"]);
const AWARD_STATUSES = new Set(["pending", "approved", "reversed"]);
const PAYMENT_PURPOSES = new Set(["donation", "trip_payment", "admin_fee", "scholarship_contribution", "refund", "other"]);
const PAYMENT_STATUSES = new Set(["pending", "received", "refunded", "voided"]);
const SOURCE_SYSTEMS = new Set(["manual", "csm", "paypal", "venmo", "import", "other"]);
const REQUEST_STATUSES = new Set(["draft", "ready", "sent", "partially_paid", "paid", "canceled"]);
const MESSAGE_TYPES = new Set(["invitation", "payment_request", "statement", "trip_update", "other"]);

type JsonRecord = Record<string, unknown>;

type TripInput = {
  opportunityId: string | null;
  code: string;
  slug: string;
  title: string;
  subtitle: string | null;
  location: string;
  startDate: string | null;
  endDate: string | null;
  status: string;
  capacity: number | null;
  publicSummary: string | null;
  publicDescription: string | null;
  publicCallToAction: string | null;
  publicEnabled: number;
  interestEnabled: number;
  portalEnabled: number;
};

type TripRow = {
  id: string;
  code: string;
  slug: string;
  title: string;
  opportunity_id: string | null;
  portal_enabled: number;
  portal_login_id: string | null;
  portal_password_hash: string | null;
  portal_password_salt: string | null;
  portal_password_iterations: number | null;
};

type TripAccountRow = {
  id: string;
  trip_id: string;
  name: string;
  account_type: string;
  person_id: string | null;
  ministry_id: string | null;
  billing_email: string | null;
  financial_access: string;
  status: string;
};

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function text(value: unknown, field: string, maximum = 160): string {
  if (typeof value !== "string") throw new AdminError(422, "INVALID_FIELD", `${field} is required.`);
  const cleaned = value.normalize("NFKC").replace(/\s+/g, " ").trim();
  if (!cleaned || cleaned.length > maximum || /[\u0000-\u001F\u007F]/.test(cleaned)) {
    throw new AdminError(422, "INVALID_FIELD", `${field} is required and must use ${maximum} characters or fewer.`);
  }
  return cleaned;
}

function optionalText(value: unknown, field: string, maximum = 2_000, multiline = false): string | null {
  if (value === undefined || value === null || value === "") return null;
  if (typeof value !== "string") throw new AdminError(422, "INVALID_FIELD", `${field} is not valid.`);
  const cleaned = multiline
    ? value.normalize("NFKC").replace(/\r\n?/g, "\n").trim()
    : value.normalize("NFKC").replace(/\s+/g, " ").trim();
  const invalidControls = multiline ? /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/ : /[\u0000-\u001F\u007F]/;
  if (!cleaned || cleaned.length > maximum || invalidControls.test(cleaned)) {
    throw new AdminError(422, "INVALID_FIELD", `${field} must use ${maximum} characters or fewer.`);
  }
  return cleaned;
}

function identifier(value: unknown, field: string): string {
  const cleaned = text(value, field, 100).toLocaleLowerCase("en-US");
  if (!/^[a-z0-9][a-z0-9-]*$/.test(cleaned)) {
    throw new AdminError(422, "INVALID_FIELD", `${field} may use lowercase letters, numbers, and hyphens.`);
  }
  return cleaned;
}

function uuid(value: unknown, field: string, optional = false): string | null {
  if (optional && (value === undefined || value === null || value === "")) return null;
  if (typeof value !== "string" || !/^[0-9a-f-]{36}$/i.test(value)) {
    throw new AdminError(422, "INVALID_FIELD", `Choose a valid ${field}.`);
  }
  return value;
}
function recordId(value: unknown, field: string, optional = false): string | null {
  if (optional && (value === undefined || value === null || value === "")) return null;
  if (typeof value !== "string" || !/^[A-Za-z0-9][A-Za-z0-9_-]{2,99}$/.test(value)) {
    throw new AdminError(422, "INVALID_FIELD", `Choose a valid ${field}.`);
  }
  return value;
}


function date(value: unknown, field: string, optional = true): string | null {
  if (optional && (value === undefined || value === null || value === "")) return null;
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value) || Number.isNaN(Date.parse(`${value}T00:00:00Z`))) {
    throw new AdminError(422, "INVALID_FIELD", `Choose a valid ${field}.`);
  }
  return value;
}

function money(value: unknown, field: string, allowZero = false): number {
  const amount = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(amount) || amount < (allowZero ? 0 : 0.01) || amount > MONEY_LIMIT) {
    throw new AdminError(422, "INVALID_FIELD", `${field} must be a valid amount.`);
  }
  return Math.round(amount * 100) / 100;
}

function positiveNumber(value: unknown, field: string, fallback = 1): number {
  if (value === undefined || value === null || value === "") return fallback;
  const number = Number(value);
  if (!Number.isFinite(number) || number <= 0 || number > 100_000) {
    throw new AdminError(422, "INVALID_FIELD", `${field} must be greater than zero.`);
  }
  return number;
}

function optionalInteger(value: unknown, field: string): number | null {
  if (value === undefined || value === null || value === "") return null;
  const number = Number(value);
  if (!Number.isInteger(number) || number <= 0 || number > 100_000) {
    throw new AdminError(422, "INVALID_FIELD", `${field} must be a positive whole number.`);
  }
  return number;
}

function choice(value: unknown, field: string, allowed: Set<string>, fallback?: string): string {
  const selected = typeof value === "string" && value ? value : fallback;
  if (!selected || !allowed.has(selected)) throw new AdminError(422, "INVALID_FIELD", `Choose a valid ${field}.`);
  return selected;
}

function flag(value: unknown): number {
  return value === true || value === 1 || value === "1" ? 1 : 0;
}

function email(value: unknown, field: string, optional = true): string | null {
  const cleaned = optionalText(value, field, 254);
  if (cleaned === null && optional) return null;
  if (!cleaned || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleaned)) {
    throw new AdminError(422, "INVALID_FIELD", `Enter a valid ${field}.`);
  }
  return cleaned;
}

function url(value: unknown, field: string): string | null {
  const cleaned = optionalText(value, field, 500);
  if (!cleaned) return null;
  try {
    const parsed = new URL(cleaned);
    if (parsed.protocol !== "https:") throw new Error("HTTPS required");
    return parsed.toString();
  } catch {
    throw new AdminError(422, "INVALID_FIELD", `${field} must be a secure https:// address.`);
  }
}

export function normalizeTripCatalogName(value: string): string {
  return value.normalize("NFKC").replace(/\s+/g, " ").trim().toLocaleLowerCase("en-US");
}

export function calculateTripAccountBalance(input: { charges: number; payments: number; awards: number }): number {
  return Math.round((input.charges - input.payments - input.awards) * 100) / 100;
}

export function validateTripInput(body: JsonRecord): TripInput {
  const startDate = date(body.startDate, "start date");
  const endDate = date(body.endDate, "end date");
  if (startDate && endDate && endDate < startDate) {
    throw new AdminError(422, "INVALID_DATE_RANGE", "The trip end date cannot be before its start date.");
  }
  return {
    opportunityId: recordId(body.opportunityId, "public opportunity", true),
    code: text(body.code, "Trip ID", 40).toLocaleUpperCase("en-US"),
    slug: identifier(body.slug, "Public address"),
    title: text(body.title, "Trip name", 160),
    subtitle: optionalText(body.subtitle, "Subtitle", 200),
    location: text(body.location, "Location", 200),
    startDate,
    endDate,
    status: choice(body.status, "trip status", TRIP_STATUSES, "draft"),
    capacity: optionalInteger(body.capacity, "capacity"),
    publicSummary: optionalText(body.publicSummary, "Public summary", 500, true),
    publicDescription: optionalText(body.publicDescription, "Public description", 8_000, true),
    publicCallToAction: optionalText(body.publicCallToAction, "Public call to action", 80),
    publicEnabled: flag(body.publicEnabled),
    interestEnabled: flag(body.interestEnabled),
    portalEnabled: flag(body.portalEnabled),
  };
}

function base64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function base64UrlBytes(value: string): Uint8Array<ArrayBuffer> | null {
  try {
    const padded = value.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(value.length / 4) * 4, "=");
    const decoded = atob(padded);
    return Uint8Array.from(decoded, character => character.charCodeAt(0));
  } catch {
    return null;
  }
}

function randomToken(byteLength = 32): string {
  const bytes = new Uint8Array(byteLength);
  crypto.getRandomValues(bytes);
  return base64Url(bytes);
}

async function hashText(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return base64Url(new Uint8Array(digest));
}

async function derivePassword(password: string, salt: Uint8Array<ArrayBuffer>, iterations = PASSWORD_ITERATIONS): Promise<string> {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(password), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt, iterations }, key, 256);
  return base64Url(new Uint8Array(bits));
}

function cookieValue(request: Request, name: string): string | null {
  const cookie = request.headers.get("cookie");
  if (!cookie) return null;
  for (const item of cookie.split(";")) {
    const separator = item.indexOf("=");
    if (separator >= 0 && item.slice(0, separator).trim() === name) return item.slice(separator + 1).trim();
  }
  return null;
}

function portalCookie(token: string, maxAge: number): string {
  return `hs_trip_portal_session=${token}; Path=/api/interest/portal; Max-Age=${maxAge}; HttpOnly; Secure; SameSite=Strict`;
}

async function requireTrip(env: AdminEnv, tripId: string): Promise<TripRow> {
  const trip = await env.DB.prepare(
    `SELECT id, code, slug, title, opportunity_id, portal_enabled, portal_login_id,
            portal_password_hash, portal_password_salt, portal_password_iterations
     FROM trips WHERE id = ?1`,
  ).bind(tripId).first<TripRow>();
  if (!trip) throw new AdminError(404, "TRIP_NOT_FOUND", "That trip could not be found.");
  return trip;
}

async function requireAccount(env: AdminEnv, tripId: string, accountId: string): Promise<TripAccountRow> {
  const account = await env.DB.prepare(
    `SELECT id, trip_id, name, account_type, person_id, ministry_id, billing_email, financial_access, status
     FROM trip_accounts WHERE id = ?1 AND trip_id = ?2`,
  ).bind(accountId, tripId).first<TripAccountRow>();
  if (!account) throw new AdminError(404, "ACCOUNT_NOT_FOUND", "That trip account could not be found.");
  return account;
}

async function listBootstrap(request: Request, env: AdminEnv): Promise<Response> {
  await authenticate(request, env);
  const [trips, opportunities, sources, categories, people, ministries] = await Promise.all([
    env.DB.prepare(
      `SELECT t.*, o.title AS opportunity_title,
              (SELECT COUNT(*) FROM trip_members tm WHERE tm.trip_id = t.id AND tm.status NOT IN ('withdrawn')) AS member_count
       FROM trips t LEFT JOIN opportunities o ON o.id = t.opportunity_id
       ORDER BY CASE WHEN t.start_date IS NULL THEN 1 ELSE 0 END, t.start_date, t.title`,
    ).all(),
    env.DB.prepare("SELECT id, title, location, kind, active FROM opportunities ORDER BY kind, sort_order, title").all(),
    env.DB.prepare("SELECT * FROM trip_funding_sources ORDER BY status, name_normalized").all(),
    env.DB.prepare("SELECT * FROM trip_cost_categories ORDER BY status, sort_order, name_normalized").all(),
    env.DB.prepare("SELECT id, first_name, last_name, preferred_name, email, phone, organization, contact_status FROM people ORDER BY last_name_normalized, first_name_normalized").all(),
    env.DB.prepare("SELECT id, name, email, phone, status FROM ministries ORDER BY name_normalized").all(),
  ]);
  return adminJson({
    trips: trips.results,
    opportunities: opportunities.results,
    fundingSources: sources.results,
    costCategories: categories.results,
    people: people.results,
    ministries: ministries.results,
  });
}

async function createTrip(request: Request, env: AdminEnv): Promise<Response> {
  const session = await authenticate(request, env, true);
  const input = validateTripInput(await readAdminJson(request));
  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  await env.DB.batch([
    env.DB.prepare(
      `INSERT INTO trips (
         id, opportunity_id, code, slug, title, subtitle, location, start_date, end_date, status, capacity,
         public_summary, public_description, public_call_to_action, public_enabled, interest_enabled, portal_enabled,
         created_by_session_id, created_at, updated_at
       ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16, ?17, ?18, ?19, ?19)`,
    ).bind(
      id, input.opportunityId, input.code, input.slug, input.title, input.subtitle, input.location,
      input.startDate, input.endDate, input.status, input.capacity, input.publicSummary, input.publicDescription,
      input.publicCallToAction, input.publicEnabled, input.interestEnabled, input.portalEnabled, session.id, now,
    ),
    auditStatement(env, "trip", id, "created", { code: input.code, title: input.title }),
  ]);
  return adminJson({ id }, 201);
}

async function updateTrip(request: Request, env: AdminEnv, tripId: string): Promise<Response> {
  await authenticate(request, env, true);
  await requireTrip(env, tripId);
  const input = validateTripInput(await readAdminJson(request));
  const now = new Date().toISOString();
  await env.DB.batch([
    env.DB.prepare(
      `UPDATE trips SET opportunity_id = ?1, code = ?2, slug = ?3, title = ?4, subtitle = ?5, location = ?6,
         start_date = ?7, end_date = ?8, status = ?9, capacity = ?10, public_summary = ?11,
         public_description = ?12, public_call_to_action = ?13, public_enabled = ?14, interest_enabled = ?15,
         portal_enabled = ?16, updated_at = ?17 WHERE id = ?18`,
    ).bind(
      input.opportunityId, input.code, input.slug, input.title, input.subtitle, input.location, input.startDate,
      input.endDate, input.status, input.capacity, input.publicSummary, input.publicDescription,
      input.publicCallToAction, input.publicEnabled, input.interestEnabled, input.portalEnabled, now, tripId,
    ),
    auditStatement(env, "trip", tripId, "updated", { code: input.code, status: input.status }),
  ]);
  return adminJson({ ok: true });
}

async function updatePortalCredential(request: Request, env: AdminEnv, tripId: string): Promise<Response> {
  await authenticate(request, env, true);
  await requireTrip(env, tripId);
  const body = await readAdminJson(request);
  const loginId = text(body.loginId, "Trip login ID", 80);
  const password = typeof body.password === "string" ? body.password : "";
  if (password.length < 10 || password.length > 128) {
    throw new AdminError(422, "WEAK_TRIP_PASSWORD", "Use at least 10 characters for the shared trip password.");
  }
  const salt = new Uint8Array(16);
  crypto.getRandomValues(salt);
  const hash = await derivePassword(password, salt);
  const now = new Date().toISOString();
  await env.DB.batch([
    env.DB.prepare(
      `UPDATE trips SET portal_login_id = ?1, portal_password_salt = ?2, portal_password_hash = ?3,
         portal_password_iterations = ?4, portal_enabled = 1, portal_updated_at = ?5, updated_at = ?5 WHERE id = ?6`,
    ).bind(loginId, base64Url(salt), hash, PASSWORD_ITERATIONS, now, tripId),
    env.DB.prepare("DELETE FROM trip_portal_sessions WHERE trip_id = ?1").bind(tripId),
    auditStatement(env, "trip", tripId, "portal_credential_changed", { loginId }),
  ]);
  return adminJson({ ok: true, loginId });
}

async function tripWorkspace(request: Request, env: AdminEnv, tripId: string): Promise<Response> {
  await authenticate(request, env);
  await requireTrip(env, tripId);
  const queries = [
    env.DB.prepare("SELECT t.*, o.title AS opportunity_title FROM trips t LEFT JOIN opportunities o ON o.id = t.opportunity_id WHERE t.id = ?1").bind(tripId).first(),
    env.DB.prepare(`SELECT tc.* FROM trip_content tc WHERE tc.trip_id = ?1 ORDER BY tc.content_type, tc.event_date, tc.sort_order, tc.title`).bind(tripId).all(),
    env.DB.prepare(`SELECT tm.*, p.first_name, p.last_name, p.preferred_name, p.email, p.phone, m.name AS ministry_name
      FROM trip_members tm JOIN people p ON p.id = tm.person_id LEFT JOIN ministries m ON m.id = tm.ministry_id
      WHERE tm.trip_id = ?1 ORDER BY tm.role, p.last_name_normalized, p.first_name_normalized`).bind(tripId).all(),
    env.DB.prepare(`SELECT ti.*, p.first_name, p.last_name, p.preferred_name, p.email, p.phone,
      i.label AS invite_label, m.name AS invite_ministry_name
      FROM trip_interests ti JOIN people p ON p.id = ti.person_id
      LEFT JOIN trip_invites i ON i.id = ti.invite_id LEFT JOIN ministries m ON m.id = i.ministry_id
      WHERE ti.trip_id = ?1 ORDER BY ti.created_at DESC`).bind(tripId).all(),
    env.DB.prepare(`SELECT tor.*, m.name AS ministry_name FROM trip_organizations tor JOIN ministries m ON m.id = tor.ministry_id
      WHERE tor.trip_id = ?1 ORDER BY m.name_normalized, tor.role`).bind(tripId).all(),
    env.DB.prepare(`SELECT ta.*, p.first_name, p.last_name, m.name AS ministry_name,
      COALESCE((SELECT SUM(c.amount) FROM trip_charges c WHERE c.account_id = ta.id AND c.status NOT IN ('canceled', 'waived')), 0) AS charges_total,
      COALESCE((SELECT SUM(pmt.amount) FROM trip_payments pmt WHERE pmt.account_id = ta.id AND pmt.status = 'received' AND pmt.purpose IN ('trip_payment', 'admin_fee', 'other')), 0) AS payments_total,
      COALESCE((SELECT SUM(a.amount) FROM trip_coverage_awards a WHERE a.account_id = ta.id AND a.status = 'approved'), 0) AS awards_total
      FROM trip_accounts ta LEFT JOIN people p ON p.id = ta.person_id LEFT JOIN ministries m ON m.id = ta.ministry_id
      WHERE ta.trip_id = ?1 ORDER BY ta.status, ta.name`).bind(tripId).all(),
    env.DB.prepare(`SELECT ci.*, cc.name AS category_name, m.name AS vendor_ministry_name,
      COALESCE((SELECT SUM(a.amount) FROM trip_cost_allocations a WHERE a.cost_item_id = ci.id AND a.status != 'canceled'), 0) AS allocated_total
      FROM trip_cost_items ci JOIN trip_cost_categories cc ON cc.id = ci.category_id
      LEFT JOIN ministries m ON m.id = ci.vendor_ministry_id WHERE ci.trip_id = ?1
      ORDER BY cc.sort_order, ci.created_at`).bind(tripId).all(),
    env.DB.prepare(`SELECT a.*, fs.name AS funding_source_name FROM trip_cost_allocations a
      JOIN trip_cost_items ci ON ci.id = a.cost_item_id JOIN trip_funding_sources fs ON fs.id = a.funding_source_id
      WHERE ci.trip_id = ?1 ORDER BY a.created_at`).bind(tripId).all(),
    env.DB.prepare(`SELECT c.*, ta.name AS account_name,
      COALESCE((SELECT SUM(pa.amount) FROM trip_payment_applications pa WHERE pa.charge_id = c.id), 0) AS applied_total
      FROM trip_charges c JOIN trip_accounts ta ON ta.id = c.account_id WHERE c.trip_id = ?1 ORDER BY c.due_date, c.created_at`).bind(tripId).all(),
    env.DB.prepare(`SELECT a.*, ta.name AS account_name, fs.name AS funding_source_name FROM trip_coverage_awards a
      JOIN trip_accounts ta ON ta.id = a.account_id JOIN trip_funding_sources fs ON fs.id = a.funding_source_id
      WHERE a.trip_id = ?1 ORDER BY a.award_date, a.created_at`).bind(tripId).all(),
    env.DB.prepare(`SELECT p.*, ta.name AS account_name, fs.name AS funding_source_name FROM trip_payments p
      LEFT JOIN trip_accounts ta ON ta.id = p.account_id LEFT JOIN trip_funding_sources fs ON fs.id = p.funding_source_id
      WHERE p.trip_id = ?1 ORDER BY p.transaction_date DESC, p.created_at DESC`).bind(tripId).all(),
    env.DB.prepare(`SELECT pr.*, ta.name AS account_name FROM trip_payment_requests pr JOIN trip_accounts ta ON ta.id = pr.account_id
      WHERE pr.trip_id = ?1 ORDER BY pr.created_at DESC`).bind(tripId).all(),
    env.DB.prepare(`SELECT i.*, m.name AS ministry_name FROM trip_invites i LEFT JOIN ministries m ON m.id = i.ministry_id
      WHERE i.trip_id = ?1 ORDER BY i.created_at DESC`).bind(tripId).all(),
    env.DB.prepare(`SELECT o.* FROM trip_message_outbox o WHERE o.trip_id = ?1 ORDER BY o.created_at DESC`).bind(tripId).all(),
  ] as const;
  const [trip, content, members, interests, organizations, accounts, costs, allocations, charges, awards, payments, requests, invites, outbox] = await Promise.all(queries);
  const accountRows = accounts.results as unknown as Array<JsonRecord>;
  for (const account of accountRows) {
    account.balance = calculateTripAccountBalance({
      charges: Number(account.charges_total ?? 0),
      payments: Number(account.payments_total ?? 0),
      awards: Number(account.awards_total ?? 0),
    });
  }
  return adminJson({
    trip, content: content.results, members: members.results, interests: interests.results, organizations: organizations.results,
    accounts: accountRows, costs: costs.results, allocations: allocations.results, charges: charges.results,
    awards: awards.results, payments: payments.results, paymentRequests: requests.results,
    invites: invites.results, outbox: outbox.results,
  });
}

async function saveFundingSource(request: Request, env: AdminEnv): Promise<Response> {
  await authenticate(request, env, true);
  const body = await readAdminJson(request);
  const existingId = uuid(body.id, "funding source", true);
  const id = existingId ?? crypto.randomUUID();
  const name = text(body.name, "Funding source name", 160);
  const normalized = normalizeTripCatalogName(name);
  const sourceType = choice(body.sourceType, "funding source type", SOURCE_TYPES, "other");
  const personId = uuid(body.personId, "person", true);
  const ministryId = uuid(body.ministryId, "ministry", true);
  const status = choice(body.status, "status", new Set(["active", "inactive"]), "active");
  const now = new Date().toISOString();
  const statement = existingId
    ? env.DB.prepare(`UPDATE trip_funding_sources SET name = ?1, name_normalized = ?2, source_type = ?3,
        person_id = ?4, ministry_id = ?5, contact_name = ?6, email = ?7, phone = ?8, notes = ?9,
        default_payment_method = ?10, status = ?11, updated_at = ?12 WHERE id = ?13 AND system_key IS NULL`).bind(
        name, normalized, sourceType, personId, ministryId, optionalText(body.contactName, "Contact name", 160),
        email(body.email, "email"), optionalText(body.phone, "phone", 40), optionalText(body.notes, "Notes", 2_000, true),
        optionalText(body.defaultPaymentMethod, "Default payment method", 80), status, now, id,
      )
    : env.DB.prepare(`INSERT INTO trip_funding_sources (
        id, name, name_normalized, source_type, person_id, ministry_id, contact_name, email, phone, notes,
        default_payment_method, status, created_at, updated_at
      ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?13)`).bind(
        id, name, normalized, sourceType, personId, ministryId, optionalText(body.contactName, "Contact name", 160),
        email(body.email, "email"), optionalText(body.phone, "phone", 40), optionalText(body.notes, "Notes", 2_000, true),
        optionalText(body.defaultPaymentMethod, "Default payment method", 80), status, now,
      );
  const result = await statement.run();
  if (existingId && !result.meta.changes) throw new AdminError(409, "SYSTEM_SOURCE", "Built-in funding sources cannot be renamed; create a new source instead.");
  await auditStatement(env, "trip_funding_source", id, existingId ? "updated" : "created", { name }).run();
  return adminJson({ id }, existingId ? 200 : 201);
}

async function saveCostCategory(request: Request, env: AdminEnv): Promise<Response> {
  await authenticate(request, env, true);
  const body = await readAdminJson(request);
  const existingId = uuid(body.id, "cost category", true);
  const id = existingId ?? crypto.randomUUID();
  const name = text(body.name, "Category name", 120);
  const normalized = normalizeTripCatalogName(name);
  const status = choice(body.status, "status", new Set(["active", "inactive"]), "active");
  const sortOrder = body.sortOrder === undefined || body.sortOrder === "" ? 500 : Math.max(0, Math.min(10_000, Number(body.sortOrder)));
  const now = new Date().toISOString();
  const statement = existingId
    ? env.DB.prepare(`UPDATE trip_cost_categories SET name = ?1, name_normalized = ?2, description = ?3,
        sort_order = ?4, status = ?5, updated_at = ?6 WHERE id = ?7 AND system_key IS NULL`).bind(
        name, normalized, optionalText(body.description, "Description", 500, true), sortOrder, status, now, id,
      )
    : env.DB.prepare(`INSERT INTO trip_cost_categories (id, name, name_normalized, description, sort_order, status, created_at, updated_at)
        VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?7)`).bind(
        id, name, normalized, optionalText(body.description, "Description", 500, true), sortOrder, status, now,
      );
  const result = await statement.run();
  if (existingId && !result.meta.changes) throw new AdminError(409, "SYSTEM_CATEGORY", "Built-in categories cannot be renamed; create a new category instead.");
  await auditStatement(env, "trip_cost_category", id, existingId ? "updated" : "created", { name }).run();
  return adminJson({ id }, existingId ? 200 : 201);
}

async function saveContent(request: Request, env: AdminEnv, tripId: string): Promise<Response> {
  await authenticate(request, env, true);
  await requireTrip(env, tripId);
  const body = await readAdminJson(request);
  const existingId = uuid(body.id, "content item", true);
  const id = existingId ?? crypto.randomUUID();
  const now = new Date().toISOString();
  const values = {
    type: choice(body.contentType, "content type", CONTENT_TYPES),
    title: text(body.title, "Title", 180),
    content: optionalText(body.content, "Content", 12_000, true) ?? "",
    eventDate: date(body.eventDate, "event date"),
    eventTime: optionalText(body.eventTime, "event time", 40),
    location: optionalText(body.location, "location", 200),
    linkUrl: url(body.linkUrl, "Link"),
    visibility: choice(body.visibility, "visibility", VISIBILITIES, "travelers"),
    publicationStatus: choice(body.publicationStatus, "publication status", new Set(["draft", "published"]), "draft"),
    sortOrder: Number.isFinite(Number(body.sortOrder)) ? Math.trunc(Number(body.sortOrder)) : 0,
  };
  const statement = existingId
    ? env.DB.prepare(`UPDATE trip_content SET content_type = ?1, title = ?2, content = ?3, event_date = ?4,
        event_time = ?5, location = ?6, link_url = ?7, visibility = ?8, publication_status = ?9,
        sort_order = ?10, updated_at = ?11 WHERE id = ?12 AND trip_id = ?13`).bind(
        values.type, values.title, values.content, values.eventDate, values.eventTime, values.location, values.linkUrl,
        values.visibility, values.publicationStatus, values.sortOrder, now, id, tripId,
      )
    : env.DB.prepare(`INSERT INTO trip_content (
        id, trip_id, content_type, title, content, event_date, event_time, location, link_url,
        visibility, publication_status, sort_order, created_at, updated_at
      ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?13)`).bind(
        id, tripId, values.type, values.title, values.content, values.eventDate, values.eventTime, values.location,
        values.linkUrl, values.visibility, values.publicationStatus, values.sortOrder, now,
      );
  const result = await statement.run();
  if (existingId && !result.meta.changes) throw new AdminError(404, "CONTENT_NOT_FOUND", "That content item could not be found.");
  await auditStatement(env, "trip_content", id, existingId ? "updated" : "created", { tripId, title: values.title, visibility: values.visibility }).run();
  return adminJson({ id }, existingId ? 200 : 201);
}

async function saveOrganization(request: Request, env: AdminEnv, tripId: string): Promise<Response> {
  await authenticate(request, env, true);
  await requireTrip(env, tripId);
  const body = await readAdminJson(request);
  const ministryId = uuid(body.ministryId, "organization")!;
  const role = text(body.role, "Organization role", 100);
  const now = new Date().toISOString();
  await env.DB.batch([
    env.DB.prepare(`INSERT INTO trip_organizations (trip_id, ministry_id, role, notes, created_at, updated_at)
      VALUES (?1, ?2, ?3, ?4, ?5, ?5)
      ON CONFLICT (trip_id, ministry_id, role) DO UPDATE SET notes = excluded.notes, updated_at = excluded.updated_at`).bind(
      tripId, ministryId, role, optionalText(body.notes, "Notes", 1_000, true), now,
    ),
    auditStatement(env, "trip", tripId, "organization_linked", { ministryId, role }),
  ]);
  return adminJson({ ok: true });
}

async function saveMember(request: Request, env: AdminEnv, tripId: string): Promise<Response> {
  await authenticate(request, env, true);
  await requireTrip(env, tripId);
  const body = await readAdminJson(request);
  const personId = uuid(body.personId, "person")!;
  const ministryId = uuid(body.ministryId, "organization", true);
  const role = choice(body.role, "member role", MEMBER_ROLES, "traveler");
  const status = choice(body.status, "member status", MEMBER_STATUSES, "invited");
  const now = new Date().toISOString();
  await env.DB.batch([
    env.DB.prepare(`INSERT INTO trip_members (
      trip_id, person_id, ministry_id, role, status, directory_visible, directory_email_visible,
      directory_phone_visible, notes, created_at, updated_at
    ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?10)
    ON CONFLICT (trip_id, person_id) DO UPDATE SET ministry_id = excluded.ministry_id, role = excluded.role,
      status = excluded.status, directory_visible = excluded.directory_visible,
      directory_email_visible = excluded.directory_email_visible,
      directory_phone_visible = excluded.directory_phone_visible, notes = excluded.notes, updated_at = excluded.updated_at`).bind(
      tripId, personId, ministryId, role, status, flag(body.directoryVisible), flag(body.directoryEmailVisible),
      flag(body.directoryPhoneVisible), optionalText(body.notes, "Notes", 1_000, true), now,
    ),
    env.DB.prepare("INSERT OR IGNORE INTO contact_types (person_id, contact_type, created_at) VALUES (?1, ?2, ?3)").bind(
      personId, role === "leader" ? "leader" : "traveler", now,
    ),
    auditStatement(env, "trip", tripId, "member_saved", { personId, role, status }),
  ]);
  return adminJson({ ok: true });
}

async function saveAccount(request: Request, env: AdminEnv, tripId: string): Promise<Response> {
  await authenticate(request, env, true);
  await requireTrip(env, tripId);
  const body = await readAdminJson(request);
  const existingId = uuid(body.id, "account", true);
  const id = existingId ?? crypto.randomUUID();
  const accountType = choice(body.accountType, "account type", ACCOUNT_TYPES);
  const name = text(body.name, "Account name", 180);
  const personId = uuid(body.personId, "person", true);
  const ministryId = uuid(body.ministryId, "organization", true);
  if (accountType === "individual" && !personId) throw new AdminError(422, "PERSON_REQUIRED", "Choose the person for an individual account.");
  if (accountType === "organization" && !ministryId) throw new AdminError(422, "ORGANIZATION_REQUIRED", "Choose the organization for this account.");
  const now = new Date().toISOString();
  const values = [
    accountType, name, personId, ministryId, email(body.billingEmail, "billing email"),
    optionalText(body.billingPhone, "billing phone", 40),
    choice(body.financialAccess, "financial access", FINANCIAL_ACCESS, "private_link"),
    choice(body.status, "status", new Set(["active", "closed", "canceled"]), "active"),
    optionalText(body.notes, "Notes", 2_000, true), now,
  ] as const;
  const statement = existingId
    ? env.DB.prepare(`UPDATE trip_accounts SET account_type = ?1, name = ?2, person_id = ?3, ministry_id = ?4,
        billing_email = ?5, billing_phone = ?6, financial_access = ?7, status = ?8, notes = ?9,
        updated_at = ?10 WHERE id = ?11 AND trip_id = ?12`).bind(...values, id, tripId)
    : env.DB.prepare(`INSERT INTO trip_accounts (
        id, trip_id, account_type, name, person_id, ministry_id, billing_email, billing_phone,
        financial_access, status, notes, created_at, updated_at
      ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?12)`).bind(
        id, tripId, ...values.slice(0, 9), now,
      );
  const result = await statement.run();
  if (existingId && !result.meta.changes) throw new AdminError(404, "ACCOUNT_NOT_FOUND", "That trip account could not be found.");
  if (personId) await env.DB.prepare("INSERT OR IGNORE INTO trip_account_members (account_id, person_id, created_at) VALUES (?1, ?2, ?3)").bind(id, personId, now).run();
  await auditStatement(env, "trip_account", id, existingId ? "updated" : "created", { tripId, name, accountType }).run();
  return adminJson({ id }, existingId ? 200 : 201);
}

async function syncPaidTripCostLedger(env: AdminEnv, tripId: string, tripCode: string, costId: string, sessionId: string): Promise<void> {
  const cost = await env.DB.prepare(`SELECT ci.ledger_entry_id, ci.description, ci.actual_total, ci.vendor_name,
    ci.payment_method, ci.external_reference, ci.paid_date, ci.settlement_route, ci.payment_status,
    ci.account_id, ci.notes, cc.name AS category_name
    FROM trip_cost_items ci JOIN trip_cost_categories cc ON cc.id = ci.category_id
    WHERE ci.id = ?1 AND ci.trip_id = ?2`).bind(costId, tripId).first<JsonRecord>();
  if (!cost) throw new AdminError(404, "COST_NOT_FOUND", "That cost item could not be found.");
  const existingLedgerId = typeof cost.ledger_entry_id === "string" ? cost.ledger_entry_id : null;
  const shouldPost = cost.settlement_route === "through_hs" && cost.payment_status === "paid" && Number(cost.actual_total) > 0;
  const importKey = `trip-cost:${costId}`;
  const now = new Date().toISOString();

  if (!shouldPost) {
    if (!existingLedgerId) return;
    await env.DB.batch([
      env.DB.prepare("UPDATE trip_cost_items SET ledger_entry_id = NULL, updated_at = ?1 WHERE id = ?2 AND trip_id = ?3").bind(now, costId, tripId),
      env.DB.prepare("DELETE FROM ledger_entries WHERE id = ?1 AND import_key = ?2").bind(existingLedgerId, importKey),
      auditStatement(env, "ledger_entry", existingLedgerId, "deleted", { automaticTripCost: true, tripId, costId }),
    ]);
    return;
  }

  const ledgerId = existingLedgerId ?? crypto.randomUUID();
  const transactionDate = String(cost.paid_date);
  const amount = Number(cost.actual_total);
  const paymentType = typeof cost.payment_method === "string" && cost.payment_method ? cost.payment_method : "Other";
  const payee = typeof cost.vendor_name === "string" && cost.vendor_name ? cost.vendor_name : "Trip expense";
  const note = [cost.description, cost.external_reference, cost.notes].filter(value => typeof value === "string" && value).join(" | ");
  const fingerprint = await hashText(JSON.stringify({ tripId, costId, transactionDate, amount, paymentType, payee, note }));
  if (existingLedgerId) {
    const results = await env.DB.batch([
      env.DB.prepare(`UPDATE ledger_entries SET content_fingerprint = ?1, transaction_date = ?2,
        entry_type = 'expense', payment_type = ?3, expense_category = ?4, budget_category = ?5,
        amount = ?6, name = ?7, person_id = NULL, note = ?8, gross = ?6, fee = 0, net = ?9,
        updated_at = ?10, transaction_purpose = 'trip_expense', charitable_amount = 0,
        trip_id = ?11, trip_account_id = ?12, funding_source_id = NULL
        WHERE id = ?13 AND import_key = ?14`).bind(
        fingerprint, transactionDate, paymentType, cost.category_name, `Trip: ${tripCode}`, amount,
        payee, note || null, -amount, now, tripId, cost.account_id ?? null, ledgerId, importKey,
      ),
      auditStatement(env, "ledger_entry", ledgerId, "updated", { automaticTripCost: true, tripId, costId, amount }),
    ]);
    if (Number(results[0]?.meta.changes ?? 0) !== 1) {
      throw new AdminError(409, "TRIP_COST_LEDGER_MISMATCH", "The linked ledger expense could not be synchronized. Review the ledger entry and try again.");
    }
    return;
  }

  await env.DB.batch([
    env.DB.prepare(`INSERT INTO ledger_entries (
      id, source_type, import_key, content_fingerprint, financial_transaction_id, transaction_date,
      entry_type, payment_type, expense_category, budget_category, amount, name, person_id, note,
      currency, gross, fee, net, created_by_session_id, created_at, updated_at, transaction_purpose,
      charitable_amount, trip_id, trip_account_id, funding_source_id
    ) VALUES (?1, 'manual', ?2, ?3, NULL, ?4, 'expense', ?5, ?6, ?7, ?8, ?9, NULL, ?10,
      'USD', ?8, 0, ?11, ?12, ?13, ?13, 'trip_expense', 0, ?14, ?15, NULL)`).bind(
      ledgerId, importKey, fingerprint, transactionDate, paymentType, cost.category_name, `Trip: ${tripCode}`,
      amount, payee, note || null, -amount, sessionId, now, tripId, cost.account_id ?? null,
    ),
    env.DB.prepare("UPDATE trip_cost_items SET ledger_entry_id = ?1, updated_at = ?2 WHERE id = ?3 AND trip_id = ?4").bind(ledgerId, now, costId, tripId),
    auditStatement(env, "ledger_entry", ledgerId, "created", { automaticTripCost: true, tripId, costId, amount }),
  ]);
}

async function saveCostItem(request: Request, env: AdminEnv, tripId: string): Promise<Response> {
  const session = await authenticate(request, env, true);
  const trip = await requireTrip(env, tripId);
  const body = await readAdminJson(request);
  const existingId = uuid(body.id, "cost item", true);
  const id = existingId ?? crypto.randomUUID();
  const existingCost = existingId ? await env.DB.prepare("SELECT ledger_entry_id FROM trip_cost_items WHERE id = ?1 AND trip_id = ?2").bind(existingId, tripId).first<{ ledger_entry_id: string | null }>() : null;
  const quantity = positiveNumber(body.quantity, "Quantity");
  const unit = money(body.estimatedUnitCost ?? 0, "Estimated unit cost", true);
  const suppliedEstimatedTotal = body.estimatedTotal === undefined || body.estimatedTotal === "" ? null : money(body.estimatedTotal, "Estimated total", true);
  const estimatedTotal = suppliedEstimatedTotal ?? Math.round(quantity * unit * 100) / 100;
  const actualTotal = money(body.actualTotal ?? 0, "Actual total", true);
  const settlementRoute = choice(body.settlementRoute, "settlement route", SETTLEMENT_ROUTES, "through_hs");
  const paymentStatus = choice(body.paymentStatus, "payment status", COST_STATUSES, "planned");
  const paidDate = date(body.paidDate, "paid date");
  if (settlementRoute === "through_hs" && paymentStatus === "paid" && actualTotal > 0 && !paidDate) throw new AdminError(422, "PAID_DATE_REQUIRED", "Enter the date Hope Sojourns paid this expense.");
  const now = new Date().toISOString();
  const values = [
    recordId(body.categoryId, "cost category")!, text(body.description, "Description", 240),
    choice(body.expenseScope, "expense scope", COST_SCOPES, "trip"), uuid(body.accountId, "trip account", true),
    quantity, unit, estimatedTotal, actualTotal, optionalText(body.vendorName, "Vendor", 180),
    uuid(body.vendorMinistryId, "vendor organization", true), settlementRoute,
    paymentStatus, optionalText(body.paymentMethod, "Payment method", 80),
    optionalText(body.externalReference, "Reference", 160), date(body.dueDate, "due date"), paidDate,
    existingCost?.ledger_entry_id ?? null, optionalText(body.notes, "Notes", 2_000, true), now,
  ] as const;
  const statement = existingId
    ? env.DB.prepare(`UPDATE trip_cost_items SET category_id = ?1, description = ?2, expense_scope = ?3,
      account_id = ?4, quantity = ?5, estimated_unit_cost = ?6, estimated_total = ?7, actual_total = ?8,
      vendor_name = ?9, vendor_ministry_id = ?10, settlement_route = ?11, payment_status = ?12,
      payment_method = ?13, external_reference = ?14, due_date = ?15, paid_date = ?16,
      ledger_entry_id = ?17, notes = ?18, updated_at = ?19 WHERE id = ?20 AND trip_id = ?21`).bind(...values, id, tripId)
    : env.DB.prepare(`INSERT INTO trip_cost_items (
      id, trip_id, category_id, description, expense_scope, account_id, quantity, estimated_unit_cost,
      estimated_total, actual_total, vendor_name, vendor_ministry_id, settlement_route, payment_status,
      payment_method, external_reference, due_date, paid_date, ledger_entry_id, notes, created_at, updated_at
    ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16, ?17, ?18, ?19, ?20, ?21, ?21)`).bind(
      id, tripId, ...values.slice(0, 18), now,
    );
  const result = await statement.run();
  if (existingId && !result.meta.changes) throw new AdminError(404, "COST_NOT_FOUND", "That cost item could not be found.");
  await auditStatement(env, "trip_cost_item", id, existingId ? "updated" : "created", { tripId, estimatedTotal, actualTotal }).run();
  await syncPaidTripCostLedger(env, tripId, trip.code, id, session.id);
  return adminJson({ id }, existingId ? 200 : 201);
}

async function saveAllocation(request: Request, env: AdminEnv, tripId: string): Promise<Response> {
  await authenticate(request, env, true);
  await requireTrip(env, tripId);
  const body = await readAdminJson(request);
  const existingId = uuid(body.id, "allocation", true);
  const id = existingId ?? crypto.randomUUID();
  const costItemId = uuid(body.costItemId, "cost item")!;
  const belongs = await env.DB.prepare("SELECT id FROM trip_cost_items WHERE id = ?1 AND trip_id = ?2").bind(costItemId, tripId).first();
  if (!belongs) throw new AdminError(404, "COST_NOT_FOUND", "That cost item could not be found.");
  const fundingSourceId = recordId(body.fundingSourceId, "funding source")!;
  const amount = money(body.amount, "Allocation amount");
  const status = choice(body.status, "allocation status", ALLOCATION_STATUSES, "planned");
  const notes = optionalText(body.notes, "Notes", 1_000, true);
  const now = new Date().toISOString();
  const statement = existingId
    ? env.DB.prepare(`UPDATE trip_cost_allocations SET cost_item_id = ?1, funding_source_id = ?2, amount = ?3,
      status = ?4, notes = ?5, updated_at = ?6 WHERE id = ?7 AND cost_item_id IN (SELECT id FROM trip_cost_items WHERE trip_id = ?8)`).bind(
      costItemId, fundingSourceId, amount, status, notes, now, id, tripId,
    )
    : env.DB.prepare(`INSERT INTO trip_cost_allocations (id, cost_item_id, funding_source_id, amount, status, notes, created_at, updated_at)
      VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?7)`).bind(id, costItemId, fundingSourceId, amount, status, notes, now);
  const result = await statement.run();
  if (existingId && !result.meta.changes) throw new AdminError(404, "ALLOCATION_NOT_FOUND", "That allocation could not be found.");
  await auditStatement(env, "trip_cost_allocation", id, existingId ? "updated" : "created", { tripId, amount }).run();
  return adminJson({ id }, existingId ? 200 : 201);
}

async function saveCharge(request: Request, env: AdminEnv, tripId: string): Promise<Response> {
  await authenticate(request, env, true);
  await requireTrip(env, tripId);
  const body = await readAdminJson(request);
  const existingId = uuid(body.id, "charge", true);
  const id = existingId ?? crypto.randomUUID();
  const accountId = uuid(body.accountId, "trip account")!;
  await requireAccount(env, tripId, accountId);
  const values = [
    accountId, uuid(body.costItemId, "cost item", true), text(body.title, "Charge title", 180),
    choice(body.purpose, "charge purpose", CHARGE_PURPOSES, "trip_payment"), money(body.amount, "Charge amount"),
    date(body.dueDate, "due date"), choice(body.status, "charge status", CHARGE_STATUSES, "open"),
    optionalText(body.notes, "Notes", 1_000, true), new Date().toISOString(),
  ] as const;
  const statement = existingId
    ? env.DB.prepare(`UPDATE trip_charges SET account_id = ?1, cost_item_id = ?2, title = ?3, purpose = ?4,
      amount = ?5, due_date = ?6, status = ?7, notes = ?8, updated_at = ?9 WHERE id = ?10 AND trip_id = ?11`).bind(...values, id, tripId)
    : env.DB.prepare(`INSERT INTO trip_charges (id, trip_id, account_id, cost_item_id, title, purpose, amount, due_date, status, notes, created_at, updated_at)
      VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?11)`).bind(id, tripId, ...values.slice(0, 8), values[8]);
  const result = await statement.run();
  if (existingId && !result.meta.changes) throw new AdminError(404, "CHARGE_NOT_FOUND", "That charge could not be found.");
  await auditStatement(env, "trip_charge", id, existingId ? "updated" : "created", { tripId, accountId, amount: values[4] }).run();
  return adminJson({ id }, existingId ? 200 : 201);
}

async function saveAward(request: Request, env: AdminEnv, tripId: string): Promise<Response> {
  const session = await authenticate(request, env, true);
  await requireTrip(env, tripId);
  const body = await readAdminJson(request);
  const existingId = uuid(body.id, "coverage award", true);
  const id = existingId ?? crypto.randomUUID();
  const accountId = uuid(body.accountId, "trip account")!;
  await requireAccount(env, tripId, accountId);
  const values = [
    accountId, recordId(body.fundingSourceId, "funding source")!, choice(body.awardType, "coverage type", AWARD_TYPES),
    money(body.amount, "Coverage amount"), date(body.awardDate, "award date", false)!,
    choice(body.status, "coverage status", AWARD_STATUSES, "approved"), optionalText(body.reason, "Reason", 1_000, true),
    session.id, new Date().toISOString(),
  ] as const;
  const statement = existingId
    ? env.DB.prepare(`UPDATE trip_coverage_awards SET account_id = ?1, funding_source_id = ?2, award_type = ?3,
      amount = ?4, award_date = ?5, status = ?6, reason = ?7, approved_by_session_id = ?8,
      updated_at = ?9 WHERE id = ?10 AND trip_id = ?11`).bind(...values, id, tripId)
    : env.DB.prepare(`INSERT INTO trip_coverage_awards (
      id, trip_id, account_id, funding_source_id, award_type, amount, award_date, status, reason,
      approved_by_session_id, created_at, updated_at
    ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?11)`).bind(id, tripId, ...values.slice(0, 8), values[8]);
  const result = await statement.run();
  if (existingId && !result.meta.changes) throw new AdminError(404, "AWARD_NOT_FOUND", "That coverage award could not be found.");
  await auditStatement(env, "trip_coverage_award", id, existingId ? "updated" : "created", { tripId, accountId, amount: values[3] }).run();
  return adminJson({ id }, existingId ? 200 : 201);
}

async function refreshChargeStatus(env: AdminEnv, chargeId: string): Promise<void> {
  const row = await env.DB.prepare(`SELECT c.amount, c.status,
    COALESCE((SELECT SUM(a.amount) FROM trip_payment_applications a WHERE a.charge_id = c.id), 0) AS applied
    FROM trip_charges c WHERE c.id = ?1`).bind(chargeId).first<{ amount: number; status: string; applied: number }>();
  if (!row || ["waived", "canceled"].includes(row.status)) return;
  const applied = Number(row.applied);
  const status = applied >= Number(row.amount) ? "paid" : applied > 0 ? "partially_paid" : "open";
  await env.DB.prepare("UPDATE trip_charges SET status = ?1, updated_at = ?2 WHERE id = ?3").bind(status, new Date().toISOString(), chargeId).run();
}

async function savePayment(request: Request, env: AdminEnv, tripId: string): Promise<Response> {
  const session = await authenticate(request, env, true);
  const trip = await requireTrip(env, tripId);
  const body = await readAdminJson(request);
  const existingId = uuid(body.id, "payment", true);
  if (existingId) throw new AdminError(409, "PAYMENT_IMMUTABLE", "Reverse an incorrect payment and enter a corrected payment to preserve the audit history.");
  const id = crypto.randomUUID();
  const accountId = uuid(body.accountId, "trip account", true);
  const account = accountId ? await requireAccount(env, tripId, accountId) : null;
  const fundingSourceId = recordId(body.fundingSourceId, "funding source", true);
  const amount = money(body.amount, "Payment amount");
  const purpose = choice(body.purpose, "payment purpose", PAYMENT_PURPOSES, "trip_payment");
  const paymentMethod = text(body.paymentMethod, "Payment method", 80);
  const settlementRoute = choice(body.settlementRoute, "settlement route", SETTLEMENT_ROUTES, "through_hs");
  const status = choice(body.status, "payment status", PAYMENT_STATUSES, "received");
  const charitableAmount = money(body.charitableAmount ?? 0, "Charitable amount", true);
  if (charitableAmount > amount) throw new AdminError(422, "INVALID_CHARITABLE_AMOUNT", "The charitable amount cannot exceed the payment.");
  if (!["donation", "scholarship_contribution"].includes(purpose) && charitableAmount !== 0) {
    throw new AdminError(422, "NONCHARITABLE_PAYMENT", "Trip payments and administrative fees must have a charitable amount of zero.");
  }
  const transactionDate = date(body.transactionDate, "transaction date", false)!;
  const payerName = optionalText(body.payerName, "Payer name", 180) ?? account?.name ?? null;
  const sourceSystem = choice(body.sourceSystem, "source system", SOURCE_SYSTEMS, "manual");
  const sourceTransactionId = optionalText(body.sourceTransactionId, "Source transaction ID", 160);
  const externalReference = optionalText(body.externalReference, "Reference", 160);
  const notes = optionalText(body.notes, "Notes", 2_000, true);
  const now = new Date().toISOString();
  const ledgerEntryId = settlementRoute === "through_hs" && status === "received" ? crypto.randomUUID() : null;
  const contentFingerprint = await hashText(JSON.stringify({ tripId, accountId, amount, purpose, paymentMethod, transactionDate, externalReference, now }));
  const paymentStatement = env.DB.prepare(`INSERT INTO trip_payments (
      id, trip_id, account_id, funding_source_id, transaction_date, amount, purpose, payment_method,
      settlement_route, status, payer_name, external_reference, source_system, source_transaction_id,
      ledger_entry_id, charitable_amount, notes, created_at, updated_at
    ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16, ?17, ?18, ?18)`).bind(
      id, tripId, accountId, fundingSourceId, transactionDate, amount, purpose, paymentMethod, settlementRoute,
      status, payerName, externalReference, sourceSystem, sourceTransactionId, ledgerEntryId, charitableAmount, notes, now,
    );
  const statements: D1PreparedStatement[] = [];
  if (ledgerEntryId) {
    statements.push(env.DB.prepare(`INSERT INTO ledger_entries (
      id, source_type, import_key, content_fingerprint, financial_transaction_id, transaction_date,
      entry_type, payment_type, expense_category, budget_category, amount, name, person_id, note,
      currency, gross, fee, net, created_by_session_id, created_at, updated_at, transaction_purpose,
      charitable_amount, trip_id, trip_account_id, funding_source_id
    ) VALUES (?1, 'manual', ?2, ?3, NULL, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12,
      'USD', ?13, 0, ?14, ?15, ?16, ?16, ?17, ?18, ?19, ?20, ?21)`).bind(
      ledgerEntryId, `trip-payment:${id}`, contentFingerprint, transactionDate, purpose === "refund" ? "expense" : "income",
      paymentMethod, purpose === "refund" ? "Refund" : null, purpose === "donation" ? "Donations" : `Trip: ${trip.code}`,
      amount, payerName, account?.person_id ?? null, notes ?? externalReference, amount, purpose === "refund" ? -amount : amount,
      session.id, now, purpose, charitableAmount, tripId, accountId, fundingSourceId,
    ));
  }
  statements.push(paymentStatement);
  const chargeId = uuid(body.chargeId, "charge", true);
  if (chargeId) {
    if (!accountId) throw new AdminError(422, "PAYMENT_ACCOUNT_REQUIRED", "Select the same trip account when applying a payment to a charge.");
    const charge = await env.DB.prepare("SELECT id, account_id, amount FROM trip_charges WHERE id = ?1 AND trip_id = ?2").bind(chargeId, tripId).first<{ id: string; account_id: string; amount: number }>();
    if (!charge || charge.account_id !== accountId) throw new AdminError(422, "INVALID_CHARGE", "Choose a charge from this trip account.");
    const appliedAmount = money(body.appliedAmount ?? amount, "Applied amount");
    if (appliedAmount > amount) throw new AdminError(422, "INVALID_APPLICATION", "The applied amount cannot exceed the payment.");
    statements.push(env.DB.prepare("INSERT INTO trip_payment_applications (payment_id, charge_id, amount, created_at) VALUES (?1, ?2, ?3, ?4)").bind(id, chargeId, appliedAmount, now));
  }
  statements.push(auditStatement(env, "trip_payment", id, "recorded", { tripId, accountId, amount, settlementRoute, purpose }));
  await env.DB.batch(statements);
  if (chargeId) await refreshChargeStatus(env, chargeId);
  return adminJson({ id, ledgerEntryId }, 201);
}

async function savePaymentRequest(request: Request, env: AdminEnv, tripId: string): Promise<Response> {
  await authenticate(request, env, true);
  await requireTrip(env, tripId);
  const body = await readAdminJson(request);
  const existingId = uuid(body.id, "payment request", true);
  const id = existingId ?? crypto.randomUUID();
  const accountId = uuid(body.accountId, "trip account")!;
  await requireAccount(env, tripId, accountId);
  const values = [
    accountId, text(body.title, "Request title", 180), optionalText(body.message, "Message", 3_000, true),
    money(body.amountRequested, "Requested amount"), date(body.dueDate, "due date"),
    choice(body.status, "request status", REQUEST_STATUSES, "draft"), new Date().toISOString(),
  ] as const;
  const publicReference = existingId
    ? await env.DB.prepare("SELECT public_reference FROM trip_payment_requests WHERE id = ?1 AND trip_id = ?2").bind(id, tripId).first<{ public_reference: string }>()
    : null;
  const reference = publicReference?.public_reference ?? randomToken(12);
  const statement = existingId
    ? env.DB.prepare(`UPDATE trip_payment_requests SET account_id = ?1, title = ?2, message = ?3, amount_requested = ?4,
      due_date = ?5, status = ?6, updated_at = ?7 WHERE id = ?8 AND trip_id = ?9`).bind(...values, id, tripId)
    : env.DB.prepare(`INSERT INTO trip_payment_requests (
      id, trip_id, account_id, title, message, amount_requested, due_date, status, public_reference, created_at, updated_at
    ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?10)`).bind(id, tripId, ...values.slice(0, 6), reference, values[6]);
  const result = await statement.run();
  if (existingId && !result.meta.changes) throw new AdminError(404, "REQUEST_NOT_FOUND", "That payment request could not be found.");
  await auditStatement(env, "trip_payment_request", id, existingId ? "updated" : "created", { tripId, accountId, reference }).run();
  return adminJson({ id, reference }, existingId ? 200 : 201);
}

async function createAccountLink(request: Request, env: AdminEnv, tripId: string, accountId: string): Promise<Response> {
  await authenticate(request, env, true);
  const account = await requireAccount(env, tripId, accountId);
  if (account.financial_access !== "private_link") throw new AdminError(409, "PRIVATE_LINK_DISABLED", "Enable private-link access for this account first.");
  const token = randomToken();
  const id = crypto.randomUUID();
  const now = new Date();
  const expiresAt = new Date(now.getTime() + ACCOUNT_LINK_DAYS * 86_400_000).toISOString();
  await env.DB.batch([
    env.DB.prepare("UPDATE trip_account_access_tokens SET revoked_at = ?1 WHERE account_id = ?2 AND revoked_at IS NULL").bind(now.toISOString(), accountId),
    env.DB.prepare(`INSERT INTO trip_account_access_tokens (id, account_id, token_hash, expires_at, created_at)
      VALUES (?1, ?2, ?3, ?4, ?5)`).bind(id, accountId, await hashText(token), expiresAt, now.toISOString()),
    auditStatement(env, "trip_account", accountId, "private_link_created", { tripId, expiresAt }),
  ]);
  return adminJson({ token, expiresAt, path: `/trip-account/?access=${encodeURIComponent(token)}` }, 201);
}

async function createInvite(request: Request, env: AdminEnv, tripId: string): Promise<Response> {
  await authenticate(request, env, true);
  const trip = await requireTrip(env, tripId);
  const body = await readAdminJson(request);
  const token = randomToken(24);
  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  const expiresAt = date(body.expiresAt, "expiration date");
  const maxUses = optionalInteger(body.maxUses, "maximum uses");
  await env.DB.batch([
    env.DB.prepare(`INSERT INTO trip_invites (
      id, trip_id, ministry_id, label, token_hash, expires_at, max_uses, status, created_at, updated_at
    ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, 'active', ?8, ?8)`).bind(
      id, tripId, uuid(body.ministryId, "organization", true), optionalText(body.label, "Invite label", 160),
      await hashText(token), expiresAt, maxUses, now,
    ),
    auditStatement(env, "trip_invite", id, "created", { tripId, expiresAt, maxUses }),
  ]);
  const opportunityRow = trip.opportunity_id
    ? await env.DB.prepare("SELECT slug FROM opportunities WHERE id = ?1").bind(trip.opportunity_id).first<{ slug: string }>()
    : null;
  const opportunity = opportunityRow ? `&opportunity=${encodeURIComponent(opportunityRow.slug)}` : "";
  const path = `/interest/?type=trip&trip=${encodeURIComponent(tripId)}${opportunity}&invite=${encodeURIComponent(token)}`;
  return adminJson({ id, token, path }, 201);
}

async function queueMessage(request: Request, env: AdminEnv, tripId: string): Promise<Response> {
  await authenticate(request, env, true);
  await requireTrip(env, tripId);
  const body = await readAdminJson(request);
  const id = crypto.randomUUID();
  const recipient = email(body.recipientEmail, "recipient email", false)!;
  const messageType = choice(body.messageType, "message type", MESSAGE_TYPES, "other");
  const status = body.queue === true ? "queued" : "draft";
  const messageText = optionalText(body.bodyText, "Message", 8_000, true);
  if (!messageText) throw new AdminError(422, "MESSAGE_REQUIRED", "Enter a message to send.");
  const now = new Date().toISOString();
  await env.DB.batch([
    env.DB.prepare(`INSERT INTO trip_message_outbox (
      id, trip_id, account_id, payment_request_id, recipient_email, subject, body_text, message_type,
      status, created_at, updated_at
    ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?10)`).bind(
      id, tripId, uuid(body.accountId, "trip account", true), uuid(body.paymentRequestId, "payment request", true),
      recipient, text(body.subject, "Subject", 200), messageText, messageType, status, now,
    ),
    auditStatement(env, "trip_message", id, status === "queued" ? "queued" : "drafted", { tripId, recipient, messageType }),
  ]);
  return adminJson({ id, status }, 201);
}

async function sendTripMessage(request: Request, env: AdminEnv, tripId: string, messageId: string): Promise<Response> {
  const session = await authenticate(request, env, true);
  await requireTrip(env, tripId);
  const message = await env.DB.prepare(`SELECT id, recipient_email, subject, body_text, message_type, status
    FROM trip_message_outbox WHERE id = ?1 AND trip_id = ?2`).bind(messageId, tripId).first<{
      id: string; recipient_email: string; subject: string; body_text: string; message_type: string; status: string;
    }>();
  if (!message) throw new AdminError(404, "MESSAGE_NOT_FOUND", "That message could not be found.");
  if (message.status === "sent") throw new AdminError(409, "MESSAGE_ALREADY_SENT", "That message was already sent.");
  if (message.status === "canceled") throw new AdminError(409, "MESSAGE_CANCELED", "A canceled message cannot be sent.");
  if (env.EMAIL_DELIVERY_MODE !== "live" || !env.EMAIL) {
    throw new AdminError(409, "EMAIL_DELIVERY_NOT_ENABLED", "Email delivery is safely disabled in this environment. The message remains in the outbox for review.");
  }
  const from = env.EMAIL_FROM_ADDRESS ?? "admin@hopesojourns.com";
  const replyTo = env.EMAIL_REPLY_TO ?? from;
  const now = new Date().toISOString();
  try {
    const delivery = await env.EMAIL.send({
      to: message.recipient_email,
      from: { email: from, name: "Hope Sojourns" },
      replyTo,
      subject: message.subject,
      text: message.body_text,
      headers: { "X-Hope-Sojourns-Message-Type": message.message_type },
    });
    await env.DB.batch([
      env.DB.prepare(`UPDATE trip_message_outbox SET status = 'sent', provider_message_id = ?1,
        last_error = NULL, sent_at = ?2, updated_at = ?2 WHERE id = ?3 AND trip_id = ?4`).bind(delivery.messageId, now, messageId, tripId),
      auditStatement(env, "trip_message", messageId, "sent", { tripId, recipient: message.recipient_email, providerMessageId: delivery.messageId, sessionId: session.id }),
    ]);
    return adminJson({ id: messageId, status: "sent", providerMessageId: delivery.messageId });
  } catch (error) {
    const safeError = error instanceof Error ? error.message.slice(0, 500) : "Email provider rejected the message.";
    await env.DB.batch([
      env.DB.prepare(`UPDATE trip_message_outbox SET status = 'failed', last_error = ?1,
        updated_at = ?2 WHERE id = ?3 AND trip_id = ?4`).bind(safeError, now, messageId, tripId),
      auditStatement(env, "trip_message", messageId, "failed", { tripId, recipient: message.recipient_email, error: safeError, sessionId: session.id }),
    ]);
    throw new AdminError(502, "EMAIL_DELIVERY_FAILED", "The email provider could not deliver this message. It remains in the outbox so you can retry.");
  }
}

async function deleteTripResource(request: Request, env: AdminEnv, tripId: string, resource: string, id: string): Promise<Response> {
  await authenticate(request, env, true);
  await requireTrip(env, tripId);
  const allowed: Record<string, { table: string; audit: string }> = {
    content: { table: "trip_content", audit: "trip_content" },
    "cost-items": { table: "trip_cost_items", audit: "trip_cost_item" },
    allocations: { table: "trip_cost_allocations", audit: "trip_cost_allocation" },
    charges: { table: "trip_charges", audit: "trip_charge" },
    accounts: { table: "trip_accounts", audit: "trip_account" },
    invites: { table: "trip_invites", audit: "trip_invite" },
  };
  const selected = allowed[resource];
  if (!selected) throw new AdminError(404, "NOT_FOUND", "Not found.");
  const ownership = resource === "allocations"
    ? `cost_item_id IN (SELECT id FROM trip_cost_items WHERE trip_id = ?2)`
    : resource === "accounts" ? "trip_id = ?2" : "trip_id = ?2";
  const result = await env.DB.prepare(`DELETE FROM ${selected.table} WHERE id = ?1 AND ${ownership}`).bind(id, tripId).run();
  if (!result.meta.changes) throw new AdminError(404, "RECORD_NOT_FOUND", "That record could not be found.");
  await auditStatement(env, selected.audit, id, "deleted", { tripId }).run();
  return adminJson({ ok: true });
}

async function listPublicTrips(env: AdminEnv, request: Request): Promise<Response> {
  const requestUrl = new URL(request.url);
  const opportunity = requestUrl.searchParams.get("opportunity");
  const values: unknown[] = [];
  let where = "t.public_enabled = 1 AND t.status NOT IN ('draft', 'archived', 'canceled')";
  if (opportunity) {
    where += " AND (t.opportunity_id = ?1 OR o.slug = ?1 OR o.id = ?1)";
    values.push(opportunity);
  }
  const rows = await env.DB.prepare(
    `SELECT t.id, t.opportunity_id, t.code, t.slug, t.title, t.subtitle, t.location, t.start_date, t.end_date,
            t.status, t.capacity, t.public_summary, t.public_call_to_action, t.interest_enabled,
            o.slug AS opportunity_slug,
            (SELECT COUNT(*) FROM trip_members tm WHERE tm.trip_id = t.id AND tm.status = 'confirmed') AS confirmed_count
     FROM trips t LEFT JOIN opportunities o ON o.id = t.opportunity_id WHERE ${where}
     ORDER BY CASE WHEN t.start_date IS NULL THEN 1 ELSE 0 END, t.start_date, t.title`,
  ).bind(...values).all();
  return adminJson({ trips: rows.results }, 200, { "Cache-Control": "public, max-age=60" });
}

async function publicTrip(env: AdminEnv, slug: string): Promise<Response> {
  const trip = await env.DB.prepare(
    `SELECT t.id, t.opportunity_id, t.code, t.slug, t.title, t.subtitle, t.location, t.start_date, t.end_date,
            t.status, t.capacity, t.public_summary, t.public_description, t.public_call_to_action,
            t.interest_enabled, o.title AS opportunity_title, o.slug AS opportunity_slug
     FROM trips t LEFT JOIN opportunities o ON o.id = t.opportunity_id
     WHERE t.slug = ?1 AND t.public_enabled = 1 AND t.status NOT IN ('draft', 'archived', 'canceled')`,
  ).bind(slug).first();
  if (!trip) throw new AdminError(404, "TRIP_NOT_FOUND", "That public trip could not be found.");
  const content = await env.DB.prepare(
    `SELECT id, content_type, title, content, event_date, event_time, location, link_url, sort_order
     FROM trip_content WHERE trip_id = ?1 AND visibility = 'public' AND publication_status = 'published'
     ORDER BY content_type, event_date, sort_order, title`,
  ).bind((trip as JsonRecord).id).all();
  return adminJson({ trip, content: content.results }, 200, { "Cache-Control": "public, max-age=60" });
}

type PortalLoginAttempt = {
  failure_count: number;
  window_started_at: string;
  blocked_until: string | null;
};

async function portalLoginAttemptKey(request: Request, loginId: string): Promise<string> {
  const clientAddress = request.headers.get("CF-Connecting-IP") ?? request.headers.get("X-Forwarded-For")?.split(",", 1)[0]?.trim() ?? "unknown";
  return hashText(`${loginId.toLocaleLowerCase("en-US")}|${clientAddress}`);
}

async function enforcePortalLoginLimit(env: AdminEnv, keyHash: string): Promise<PortalLoginAttempt | null> {
  const attempt = await env.DB.prepare(`SELECT failure_count, window_started_at, blocked_until
    FROM trip_portal_login_attempts WHERE key_hash = ?1`).bind(keyHash).first<PortalLoginAttempt>();
  if (attempt?.blocked_until && Date.parse(attempt.blocked_until) > Date.now()) {
    const retryAfter = Math.max(1, Math.ceil((Date.parse(attempt.blocked_until) - Date.now()) / 1_000));
    throw new AdminError(429, "PORTAL_LOGIN_RATE_LIMITED", "Too many sign-in attempts. Wait a little while and try again.", { "Retry-After": String(retryAfter) });
  }
  return attempt;
}

async function recordPortalLoginFailure(env: AdminEnv, keyHash: string, attempt: PortalLoginAttempt | null): Promise<void> {
  const now = new Date();
  const windowMilliseconds = PORTAL_LOGIN_WINDOW_MINUTES * 60_000;
  const currentWindow = attempt && Date.parse(attempt.window_started_at) > now.getTime() - windowMilliseconds;
  const failureCount = currentWindow ? Number(attempt.failure_count) + 1 : 1;
  const windowStartedAt = currentWindow ? attempt.window_started_at : now.toISOString();
  const blockedUntil = failureCount >= PORTAL_LOGIN_MAX_FAILURES
    ? new Date(now.getTime() + PORTAL_LOGIN_BLOCK_MINUTES * 60_000).toISOString()
    : null;
  await env.DB.batch([
    env.DB.prepare(`INSERT INTO trip_portal_login_attempts
      (key_hash, failure_count, window_started_at, blocked_until, updated_at)
      VALUES (?1, ?2, ?3, ?4, ?5)
      ON CONFLICT (key_hash) DO UPDATE SET failure_count = excluded.failure_count,
        window_started_at = excluded.window_started_at, blocked_until = excluded.blocked_until,
        updated_at = excluded.updated_at`).bind(keyHash, failureCount, windowStartedAt, blockedUntil, now.toISOString()),
    env.DB.prepare(`DELETE FROM trip_portal_login_attempts
      WHERE key_hash <> ?1 AND updated_at < ?2`).bind(keyHash, new Date(now.getTime() - PORTAL_LOGIN_ATTEMPT_RETENTION_DAYS * 86_400_000).toISOString()),
  ]);
  if (blockedUntil) {
    throw new AdminError(429, "PORTAL_LOGIN_RATE_LIMITED", "Too many sign-in attempts. Wait a little while and try again.", { "Retry-After": String(PORTAL_LOGIN_BLOCK_MINUTES * 60) });
  }
}

async function portalLogin(request: Request, env: AdminEnv): Promise<Response> {
  const body = await readAdminJson(request);
  const loginId = text(body.loginId, "Trip login ID", 80);
  const password = typeof body.password === "string" ? body.password : "";
  const trip = await env.DB.prepare(
    `SELECT id, code, slug, title, opportunity_id, portal_enabled, portal_login_id, portal_password_hash,
            portal_password_salt, portal_password_iterations FROM trips WHERE portal_login_id = ?1 COLLATE NOCASE`,
  ).bind(loginId).first<TripRow>();
  const attemptKey = await portalLoginAttemptKey(request, loginId);
  const attempt = await enforcePortalLoginLimit(env, attemptKey);
  if (!trip || !trip.portal_enabled || !trip.portal_password_hash || !trip.portal_password_salt || !trip.portal_password_iterations) {
    await recordPortalLoginFailure(env, attemptKey, attempt);
    throw new AdminError(401, "PORTAL_LOGIN_FAILED", "The Trip ID or password was not recognized.");
  }
  const salt = base64UrlBytes(trip.portal_password_salt);
  if (!salt || trip.portal_password_iterations < 100_000 || trip.portal_password_iterations > 100_000) {
    throw new AdminError(503, "PORTAL_NOT_CONFIGURED", "This trip portal is not configured correctly.");
  }
  const derived = await derivePassword(password, salt, trip.portal_password_iterations);
  if (!(await secureEqual(derived, trip.portal_password_hash))) {
    await recordPortalLoginFailure(env, attemptKey, attempt);
    throw new AdminError(401, "PORTAL_LOGIN_FAILED", "The Trip ID or password was not recognized.");
  }
  const token = randomToken();
  const now = new Date();
  const maxAge = PORTAL_SESSION_HOURS * 3_600;
  await env.DB.prepare(`INSERT INTO trip_portal_sessions (id, trip_id, token_hash, expires_at, last_seen_at, created_at)
    VALUES (?1, ?2, ?3, ?4, ?5, ?5)`).bind(
    crypto.randomUUID(), trip.id, await hashText(token), new Date(now.getTime() + maxAge * 1_000).toISOString(), now.toISOString(),
  ).run();
  await env.DB.prepare("DELETE FROM trip_portal_login_attempts WHERE key_hash = ?1").bind(attemptKey).run();
  return adminJson({ ok: true, trip: { slug: trip.slug, title: trip.title } }, 200, { "Set-Cookie": portalCookie(token, maxAge), "Cache-Control": "no-store" });
}

async function portalSession(request: Request, env: AdminEnv): Promise<Response> {
  const token = cookieValue(request, "hs_trip_portal_session");
  if (!token) throw new AdminError(401, "PORTAL_AUTH_REQUIRED", "Enter the Trip ID and password to continue.");
  const session = await env.DB.prepare(`SELECT s.id, s.trip_id, s.expires_at FROM trip_portal_sessions s
    WHERE s.token_hash = ?1`).bind(await hashText(token)).first<{ id: string; trip_id: string; expires_at: string }>();
  if (!session || Date.parse(session.expires_at) <= Date.now()) {
    throw new AdminError(401, "PORTAL_SESSION_EXPIRED", "Your trip portal session expired. Sign in again.", { "Set-Cookie": portalCookie("", 0) });
  }
  const trip = await env.DB.prepare(`SELECT id, code, slug, title, subtitle, location, start_date, end_date, status,
    public_summary FROM trips WHERE id = ?1 AND portal_enabled = 1`).bind(session.trip_id).first();
  if (!trip) throw new AdminError(401, "PORTAL_AUTH_REQUIRED", "This trip portal is not available.");
  const [content, members, costs] = await Promise.all([
    env.DB.prepare(`SELECT id, content_type, title, content, event_date, event_time, location, link_url, visibility, sort_order
      FROM trip_content WHERE trip_id = ?1 AND publication_status = 'published' AND visibility IN ('public', 'travelers')
      ORDER BY content_type, event_date, sort_order, title`).bind(session.trip_id).all(),
    env.DB.prepare(`SELECT p.preferred_name, p.first_name, p.last_name,
      CASE WHEN tm.directory_email_visible = 1 THEN p.email ELSE NULL END AS email,
      CASE WHEN tm.directory_phone_visible = 1 THEN p.phone ELSE NULL END AS phone,
      p.city, p.region, tm.role, m.name AS ministry_name
      FROM trip_members tm JOIN people p ON p.id = tm.person_id LEFT JOIN ministries m ON m.id = tm.ministry_id
      WHERE tm.trip_id = ?1 AND tm.directory_visible = 1 AND tm.status IN ('approved', 'confirmed')
      ORDER BY tm.role, p.last_name_normalized, p.first_name_normalized`).bind(session.trip_id).all(),
    env.DB.prepare(`SELECT COALESCE(SUM(CASE WHEN actual_total > 0 THEN actual_total ELSE estimated_total END), 0) AS planned_cost
      FROM trip_cost_items WHERE trip_id = ?1 AND payment_status != 'canceled'`).bind(session.trip_id).first(),
  ]);
  await env.DB.prepare("UPDATE trip_portal_sessions SET last_seen_at = ?1 WHERE id = ?2").bind(new Date().toISOString(), session.id).run();
  return adminJson({ trip, content: content.results, members: members.results, financialOverview: costs }, 200, { "Cache-Control": "no-store" });
}

async function portalLogout(request: Request, env: AdminEnv): Promise<Response> {
  const token = cookieValue(request, "hs_trip_portal_session");
  if (token) await env.DB.prepare("DELETE FROM trip_portal_sessions WHERE token_hash = ?1").bind(await hashText(token)).run();
  return adminJson({ ok: true }, 200, { "Set-Cookie": portalCookie("", 0), "Cache-Control": "no-store" });
}

async function privateAccountStatement(request: Request, env: AdminEnv, token: string): Promise<Response> {
  if (!/^[A-Za-z0-9_-]{40,100}$/.test(token)) throw new AdminError(404, "LINK_NOT_FOUND", "That private account link is not valid.");
  const access = await env.DB.prepare(`SELECT t.id, t.account_id, t.expires_at, t.revoked_at
    FROM trip_account_access_tokens t WHERE t.token_hash = ?1`).bind(await hashText(token)).first<{ id: string; account_id: string; expires_at: string; revoked_at: string | null }>();
  if (!access || access.revoked_at || Date.parse(access.expires_at) <= Date.now()) {
    throw new AdminError(404, "LINK_NOT_FOUND", "That private account link is invalid or has expired.");
  }
  const account = await env.DB.prepare(`SELECT a.id, a.name, a.account_type, a.billing_email, a.financial_access,
    t.title AS trip_title, t.code AS trip_code, t.slug AS trip_slug, t.location, t.start_date, t.end_date
    FROM trip_accounts a JOIN trips t ON t.id = a.trip_id WHERE a.id = ?1 AND a.status = 'active'`).bind(access.account_id).first<JsonRecord>();
  if (!account || account.financial_access !== "private_link") throw new AdminError(404, "LINK_NOT_FOUND", "That private account link is not available.");
  const [charges, payments, awards, requests] = await Promise.all([
    env.DB.prepare(`SELECT id, title, purpose, amount, due_date, status,
      COALESCE((SELECT SUM(pa.amount) FROM trip_payment_applications pa WHERE pa.charge_id = trip_charges.id), 0) AS applied_total
      FROM trip_charges WHERE account_id = ?1 AND status != 'canceled' ORDER BY due_date, created_at`).bind(access.account_id).all(),
    env.DB.prepare(`SELECT id, transaction_date, amount, purpose, payment_method, settlement_route, status,
      payer_name, external_reference FROM trip_payments WHERE account_id = ?1 AND status != 'voided'
      ORDER BY transaction_date, created_at`).bind(access.account_id).all(),
    env.DB.prepare(`SELECT a.id, a.award_type, a.amount, a.award_date, a.status, a.reason, fs.name AS funding_source_name
      FROM trip_coverage_awards a JOIN trip_funding_sources fs ON fs.id = a.funding_source_id
      WHERE a.account_id = ?1 AND a.status != 'reversed' ORDER BY a.award_date, a.created_at`).bind(access.account_id).all(),
    env.DB.prepare(`SELECT id, title, message, amount_requested, due_date, status, public_reference
      FROM trip_payment_requests WHERE account_id = ?1 AND status != 'canceled' ORDER BY due_date, created_at`).bind(access.account_id).all(),
  ]);
  const chargesTotal = (charges.results as Array<JsonRecord>).filter(row => row.status !== "waived").reduce((sum, row) => sum + Number(row.amount), 0);
  const paymentsTotal = (payments.results as Array<JsonRecord>).filter(row => row.status === "received" && ["trip_payment", "admin_fee", "other"].includes(String(row.purpose))).reduce((sum, row) => sum + Number(row.amount), 0);
  const awardsTotal = (awards.results as Array<JsonRecord>).filter(row => row.status === "approved").reduce((sum, row) => sum + Number(row.amount), 0);
  await env.DB.prepare("UPDATE trip_account_access_tokens SET last_used_at = ?1 WHERE id = ?2").bind(new Date().toISOString(), access.id).run();
  return adminJson({
    account,
    summary: { charges: chargesTotal, payments: paymentsTotal, awards: awardsTotal, balance: calculateTripAccountBalance({ charges: chargesTotal, payments: paymentsTotal, awards: awardsTotal }) },
    charges: charges.results, payments: payments.results, awards: awards.results, paymentRequests: requests.results,
  }, 200, { "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" });
}

async function annualPersonSummary(request: Request, env: AdminEnv): Promise<Response> {
  await authenticate(request, env);
  const url = new URL(request.url);
  const personId = uuid(url.searchParams.get("personId"), "contact")!;
  const yearText = url.searchParams.get("year") ?? "";
  if (!/^\d{4}$/.test(yearText) || Number(yearText) < 2000 || Number(yearText) > 2200) {
    throw new AdminError(422, "INVALID_YEAR", "Choose a valid statement year.");
  }
  const year = Number(yearText);
  const start = `${year}-01-01`;
  const end = `${year + 1}-01-01`;
  const [person, contributions, hsPayments, externalPayments] = await Promise.all([
    env.DB.prepare(`SELECT id, first_name, last_name, preferred_name, organization, email, phone,
      address_line_1, address_line_2, city, region, postal_code, country
      FROM people WHERE id = ?1`).bind(personId).first(),
    env.DB.prepare(`SELECT le.id, le.transaction_date, le.charitable_amount AS amount,
      le.payment_type, le.budget_category, le.transaction_purpose, le.note,
      t.code AS trip_code, t.title AS trip_title
      FROM ledger_entries le LEFT JOIN trips t ON t.id = le.trip_id
      WHERE le.person_id = ?1 AND le.entry_type = 'income' AND le.charitable_amount > 0
        AND le.transaction_date >= ?2 AND le.transaction_date < ?3
      ORDER BY le.transaction_date, le.created_at`).bind(personId, start, end).all(),
    env.DB.prepare(`SELECT le.id, le.transaction_date, (le.amount - le.charitable_amount) AS amount, le.payment_type,
      le.transaction_purpose, le.note, 'through_hs' AS settlement_route,
      t.code AS trip_code, t.title AS trip_title
      FROM ledger_entries le LEFT JOIN trips t ON t.id = le.trip_id
      WHERE le.person_id = ?1 AND le.entry_type = 'income' AND le.amount > le.charitable_amount
        AND le.transaction_purpose IN ('donation', 'scholarship_contribution', 'trip_payment', 'admin_fee', 'other', 'reimbursement')
        AND le.transaction_date >= ?2 AND le.transaction_date < ?3
      ORDER BY le.transaction_date, le.created_at`).bind(personId, start, end).all(),
    env.DB.prepare(`SELECT tp.id, tp.transaction_date, tp.amount, tp.payment_method,
      tp.purpose AS transaction_purpose, tp.notes AS note, tp.settlement_route,
      t.code AS trip_code, t.title AS trip_title
      FROM trip_payments tp
      JOIN trip_accounts ta ON ta.id = tp.account_id
      JOIN trips t ON t.id = tp.trip_id
      WHERE ta.person_id = ?1 AND tp.status = 'received' AND tp.settlement_route = 'external'
        AND tp.purpose IN ('trip_payment', 'admin_fee', 'other')
        AND tp.transaction_date >= ?2 AND tp.transaction_date < ?3
      ORDER BY tp.transaction_date, tp.created_at`).bind(personId, start, end).all(),
  ]);
  if (!person) throw new AdminError(404, "CONTACT_NOT_FOUND", "That contact could not be found.");
  const gifts = contributions.results as Array<JsonRecord>;
  const payments = [...hsPayments.results, ...externalPayments.results] as Array<JsonRecord>;
  payments.sort((left, right) => String(left.transaction_date).localeCompare(String(right.transaction_date)));
  const charitableTotal = gifts.reduce((sum, row) => sum + Number(row.amount), 0);
  const hsPaymentTotal = payments.filter(row => row.settlement_route === "through_hs").reduce((sum, row) => sum + Number(row.amount), 0);
  const externalPaymentTotal = payments.filter(row => row.settlement_route === "external").reduce((sum, row) => sum + Number(row.amount), 0);
  return adminJson({
    person,
    year,
    contributions: gifts,
    payments,
    totals: {
      charitable: Math.round(charitableTotal * 100) / 100,
      paymentsReceivedByHs: Math.round(hsPaymentTotal * 100) / 100,
      paymentsSettledExternally: Math.round(externalPaymentTotal * 100) / 100,
      otherPayments: Math.round((hsPaymentTotal + externalPaymentTotal) * 100) / 100,
    },
    disclaimer: "Charitable contributions and payments for goods, services, travel, or administrative costs are shown separately. Confirm tax treatment with Hope Sojourns' accounting adviser before issuing an official tax acknowledgment.",
  });
}

async function routeTripAdmin(request: Request, env: AdminEnv, path: string): Promise<Response> {
  if (request.method === "GET" && path === "/admin/trip-platform/bootstrap") return listBootstrap(request, env);
  if (request.method === "POST" && path === "/admin/trip-platform/funding-sources") return saveFundingSource(request, env);
  if (request.method === "POST" && path === "/admin/trip-platform/cost-categories") return saveCostCategory(request, env);
  if (request.method === "GET" && path === "/admin/trip-platform/annual-summary") return annualPersonSummary(request, env);
  if (request.method === "POST" && path === "/admin/trips") return createTrip(request, env);

  const tripMatch = path.match(/^\/admin\/trips\/([0-9a-f-]{36})$/i);
  if (tripMatch && request.method === "GET") return tripWorkspace(request, env, tripMatch[1]);
  if (tripMatch && request.method === "PUT") return updateTrip(request, env, tripMatch[1]);

  const portalCredential = path.match(/^\/admin\/trips\/([0-9a-f-]{36})\/portal-credential$/i);
  if (portalCredential && request.method === "POST") return updatePortalCredential(request, env, portalCredential[1]);

  const accountLink = path.match(/^\/admin\/trips\/([0-9a-f-]{36})\/accounts\/([0-9a-f-]{36})\/access-links$/i);
  if (accountLink && request.method === "POST") return createAccountLink(request, env, accountLink[1], accountLink[2]);

  const resourceCreate = path.match(/^\/admin\/trips\/([0-9a-f-]{36})\/(content|organizations|members|accounts|cost-items|allocations|charges|awards|payments|payment-requests|invites|messages)$/i);
  if (resourceCreate && request.method === "POST") {
    const [, tripId, resource] = resourceCreate;
    const handlers: Record<string, (request: Request, env: AdminEnv, tripId: string) => Promise<Response>> = {
      content: saveContent,
      organizations: saveOrganization,
      members: saveMember,
      accounts: saveAccount,
      "cost-items": saveCostItem,
      allocations: saveAllocation,
      charges: saveCharge,
      awards: saveAward,
      payments: savePayment,
      "payment-requests": savePaymentRequest,
      invites: createInvite,
      messages: queueMessage,
    };
    return handlers[resource](request, env, tripId);
  }
  const messageSend = path.match(/^\/admin\/trips\/([0-9a-f-]{36})\/messages\/([0-9a-f-]{36})\/send$/i);
  if (messageSend && request.method === "POST") return sendTripMessage(request, env, messageSend[1], messageSend[2]);


  const resourceDelete = path.match(/^\/admin\/trips\/([0-9a-f-]{36})\/(content|accounts|cost-items|allocations|charges|invites)\/([0-9a-f-]{36})$/i);
  if (resourceDelete && request.method === "DELETE") return deleteTripResource(request, env, resourceDelete[1], resourceDelete[2], resourceDelete[3]);
  throw new AdminError(404, "NOT_FOUND", "Not found.");
}

export async function handleTripAdminRequest(request: Request, env: AdminEnv, path: string): Promise<Response> {
  try {
    return await routeTripAdmin(request, env, path);
  } catch (error) {
    if (error instanceof AdminError) return adminJson({ error: error.message, code: error.code }, error.status, error.headers);
    console.error(JSON.stringify({ event: "trip_admin_unhandled_error", message: error instanceof Error ? error.message : "Unknown error" }));
    return adminJson({ error: "The trip workspace encountered an unexpected error.", code: "SERVER_ERROR" }, 500);
  }
}

export async function handleTripPublicRequest(request: Request, env: AdminEnv, path: string): Promise<Response> {
  try {
    if (request.method === "GET" && path === "/public/trips") return listPublicTrips(env, request);
    const publicMatch = path.match(/^\/public\/trips\/([a-z0-9-]+)$/);
    if (request.method === "GET" && publicMatch) return publicTrip(env, publicMatch[1]);
    if (request.method === "POST" && path === "/portal/login") return portalLogin(request, env);
    if (request.method === "GET" && path === "/portal/session") return portalSession(request, env);
    if (request.method === "POST" && path === "/portal/logout") return portalLogout(request, env);
    const accountMatch = path.match(/^\/private-account\/([A-Za-z0-9_-]{40,100})$/);
    if (request.method === "GET" && accountMatch) return privateAccountStatement(request, env, accountMatch[1]);
    throw new AdminError(404, "NOT_FOUND", "Not found.");
  } catch (error) {
    if (error instanceof AdminError) return adminJson({ error: error.message, code: error.code }, error.status, error.headers);
    console.error(JSON.stringify({ event: "trip_public_unhandled_error", message: error instanceof Error ? error.message : "Unknown error" }));
    return adminJson({ error: "The trip service encountered an unexpected error.", code: "SERVER_ERROR" }, 500);
  }
}
