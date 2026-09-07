import {
  AdminError,
  adminJson,
  authenticate,
  auditStatement,
  readAdminJson,
  secureEqual,
  type AdminEnv,
} from "./admin";
import { parseTripImportSheets, type TripImportEntity, type TripImportRow } from "./trip-import";
import { excelDateValue, normalizeSpreadsheetLabel, readSpreadsheet, SpreadsheetFileError, SPREADSHEET_MAX_FILE_BYTES } from "./spreadsheet-reader";
import { buildTripWorkbook, type TripWorkbookSheet } from "./trip-xlsx";

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
const COST_CALCULATION_METHODS = new Set(["fixed", "per_traveler", "percentage_of_individual"]);
const PERCENTAGE_FEE_CATEGORY_KEYS = new Set(["hs_leadership", "hs_administration"]);
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
const CONTACT_TYPES = new Set(["prospective_traveler", "traveler", "leader", "donor", "ministry_contact", "staff", "volunteer", "other"]);

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
  paying_traveler_count: number;
  budget_completed_at: string | null;
};

export type TripBudgetCalculationInput = {
  calculationMethod: string;
  quantity: number;
  estimatedUnitCost: number;
  percentageRate?: number | null;
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
            portal_password_hash, portal_password_salt, portal_password_iterations,
            paying_traveler_count, budget_completed_at
     FROM trips WHERE id = ?1`,
  ).bind(tripId).first<TripRow>();
  if (!trip) throw new AdminError(404, "TRIP_NOT_FOUND", "That trip could not be found.");
  return trip;
}

type BudgetCostRow = {
  id: string;
  calculation_method: string;
  quantity: number;
  estimated_unit_cost: number;
  percentage_rate: number | null;
  payment_status: string;
};

async function recalculateTripBudget(
  env: AdminEnv,
  tripId: string,
  payingTravelerCount: number,
  updatedAt: string,
): Promise<void> {
  const result = await env.DB.prepare(
    `SELECT id, calculation_method, quantity, estimated_unit_cost, percentage_rate, payment_status
     FROM trip_cost_items WHERE trip_id = ?1`,
  ).bind(tripId).all<BudgetCostRow>();
  const individualBaseSubtotal = roundedMoney(result.results
    .filter(item => item.payment_status !== "canceled" && item.calculation_method === "per_traveler")
    .reduce((sum, item) => sum + Number(item.quantity) * Number(item.estimated_unit_cost), 0));
  const statements = result.results
    .filter(item => item.calculation_method !== "fixed")
    .map(item => {
      const estimate = calculateTripBudgetEstimate({
        calculationMethod: item.calculation_method,
        quantity: Number(item.quantity),
        estimatedUnitCost: Number(item.estimated_unit_cost),
        percentageRate: item.percentage_rate,
      }, payingTravelerCount, individualBaseSubtotal);
      return env.DB.prepare(
        "UPDATE trip_cost_items SET estimated_unit_cost = ?1, estimated_total = ?2, updated_at = ?3 WHERE id = ?4 AND trip_id = ?5",
      ).bind(estimate.estimatedUnitCost, estimate.estimatedTotal, updatedAt, item.id, tripId);
    });
  if (statements.length) await env.DB.batch(statements);
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

function percentage(value: unknown, field: string): number {
  const rate = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(rate) || rate < 0 || rate > 100) {
    throw new AdminError(422, "INVALID_FIELD", `${field} must be between 0 and 100.`);
  }
  return Math.round(rate * 1000) / 1000;
}

function positiveInteger(value: unknown, field: string): number {
  const number = typeof value === "number" ? value : Number(value);
  if (!Number.isInteger(number) || number < 1 || number > 100_000) {
    throw new AdminError(422, "INVALID_FIELD", `${field} must be a whole number between 1 and 100,000.`);
  }
  return number;
}

function roundedMoney(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

export function calculateTripBudgetEstimate(
  item: TripBudgetCalculationInput,
  payingTravelerCount: number,
  individualBaseSubtotal: number,
): { estimatedUnitCost: number; estimatedTotal: number } {
  const count = positiveInteger(payingTravelerCount, "Paying traveler count");
  if (item.calculationMethod === "percentage_of_individual") {
    const rate = percentage(item.percentageRate, "Percentage rate");
    const each = roundedMoney(individualBaseSubtotal * rate / 100);
    return { estimatedUnitCost: each, estimatedTotal: roundedMoney(each * count) };
  }
  const each = roundedMoney(item.quantity * item.estimatedUnitCost);
  return {
    estimatedUnitCost: item.estimatedUnitCost,
    estimatedTotal: item.calculationMethod === "per_traveler" ? roundedMoney(each * count) : each,
  };
}

function importedContactTypes(value: unknown): string[] {
  const requested = Array.isArray(value) ? value : [];
  const selected = [...new Set(requested.filter((item): item is string => typeof item === "string").map(item => item.trim()).filter(Boolean))];
  if (selected.some(item => !CONTACT_TYPES.has(item))) throw new AdminError(422, "INVALID_CONTACT_TYPE", "Choose valid contact types.");
  return selected.length ? selected : ["traveler"];
}

async function saveImportedPerson(request: Request, env: AdminEnv, tripId: string): Promise<Response> {
  const session = await authenticate(request, env, true);
  await requireTrip(env, tripId);
  const body = await readAdminJson(request);
  const existingId = uuid(body.id, "person", true);
  const id = existingId ?? crypto.randomUUID();
  const firstName = text(body.firstName, "First name", 80);
  const lastName = text(body.lastName, "Last name", 80);
  const emailAddress = email(body.email, "email", false)!;
  const phoneNumber = optionalText(body.phone, "phone", 40);
  if (phoneNumber && !/^\+?[0-9().\-\s]{7,40}$/.test(phoneNumber)) throw new AdminError(422, "INVALID_PHONE", "Enter a valid phone number.");
  const preference = choice(body.contactPreference, "contact preference", new Set(["email", "phone"]), "email");
  if (preference === "phone" && !phoneNumber) throw new AdminError(422, "PHONE_REQUIRED", "Enter a phone number when Phone is the preferred contact method.");
  const status = choice(body.contactStatus, "contact status", new Set(["active", "inactive"]), "active");
  const contactTypes = importedContactTypes(body.contactTypes);
  const now = new Date().toISOString();
  const values = [
    firstName, lastName, normalizeTripCatalogName(firstName), normalizeTripCatalogName(lastName),
    emailAddress, emailAddress.toLocaleLowerCase("en-US"), phoneNumber, phoneNumber?.replace(/\D/g, "") ?? null,
    preference, optionalText(body.fieldOfStudy, "School, field, or specialty", 160),
    optionalText(body.preferredName, "Preferred name", 80), optionalText(body.addressLine1, "Address line 1", 160),
    optionalText(body.addressLine2, "Address line 2", 160), optionalText(body.city, "City", 100),
    optionalText(body.region, "State, province, or region", 100), optionalText(body.postalCode, "Postal code", 30),
    optionalText(body.country, "Country", 100), optionalText(body.organization, "Organization", 160),
    url(body.website, "Website"), optionalText(body.notes, "Notes", 5_000, true), status, now,
  ] as const;
  const statements: D1PreparedStatement[] = [];
  if (existingId) {
    statements.push(env.DB.prepare(`UPDATE people SET first_name = ?1, last_name = ?2, first_name_normalized = ?3,
      last_name_normalized = ?4, email = ?5, email_normalized = ?6, phone = ?7, phone_normalized = ?8,
      contact_preference = ?9, field_of_study = ?10, preferred_name = ?11, address_line_1 = ?12,
      address_line_2 = ?13, city = ?14, region = ?15, postal_code = ?16, country = ?17, organization = ?18,
      website = ?19, notes = ?20, contact_status = ?21, updated_at = ?22 WHERE id = ?23`).bind(...values, id));
    statements.push(env.DB.prepare("DELETE FROM contact_types WHERE person_id = ?1").bind(id));
  } else {
    statements.push(env.DB.prepare(`INSERT INTO people (
      id, first_name, last_name, first_name_normalized, last_name_normalized, email, email_normalized,
      phone, phone_normalized, contact_preference, field_of_study, preferred_name, address_line_1,
      address_line_2, city, region, postal_code, country, organization, website, notes, record_source,
      contact_status, created_at, updated_at
    ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16, ?17,
      ?18, ?19, ?20, ?21, 'manual', ?22, ?23, ?23)`).bind(id, ...values.slice(0, 21), now));
  }
  statements.push(...contactTypes.map(contactType => env.DB.prepare(
    "INSERT INTO contact_types (person_id, contact_type, created_at) VALUES (?1, ?2, ?3)",
  ).bind(id, contactType, now)));
  statements.push(auditStatement(env, "person", id, existingId ? "contact_updated_from_trip_workbook" : "contact_created_from_trip_workbook", { tripId, sessionId: session.id }));
  try {
    const results = await env.DB.batch(statements);
    if (existingId && Number(results[0]?.meta.changes ?? 0) !== 1) throw new AdminError(404, "PERSON_NOT_FOUND", "That person could not be found.");
  } catch (error) {
    if (error instanceof AdminError) throw error;
    if (error instanceof Error && error.message.includes("UNIQUE constraint failed")) throw new AdminError(409, "CONTACT_EXISTS", "A contact with this name and email already exists.");
    throw error;
  }
  return adminJson({ id }, existingId ? 200 : 201);
}

async function saveImportedMinistry(request: Request, env: AdminEnv, tripId: string): Promise<Response> {
  const session = await authenticate(request, env, true);
  await requireTrip(env, tripId);
  const body = await readAdminJson(request);
  const existingId = uuid(body.id, "ministry", true);
  const id = existingId ?? crypto.randomUUID();
  const name = text(body.name, "Organization name", 160);
  const status = choice(body.status, "status", new Set(["active", "inactive"]), "active");
  const now = new Date().toISOString();
  const values = [
    name, normalizeTripCatalogName(name), optionalText(body.description, "Description", 2_000, true),
    optionalText(body.addressLine1, "Address line 1", 160), optionalText(body.addressLine2, "Address line 2", 160),
    optionalText(body.city, "City", 100), optionalText(body.region, "State, province, or region", 100),
    optionalText(body.postalCode, "Postal code", 30), optionalText(body.country, "Country", 100),
    email(body.email, "email"), optionalText(body.phone, "phone", 40), url(body.website, "Website"),
    optionalText(body.notes, "Notes", 5_000, true), status, now,
  ] as const;
  const statement = existingId
    ? env.DB.prepare(`UPDATE ministries SET name = ?1, name_normalized = ?2, description = ?3,
      address_line_1 = ?4, address_line_2 = ?5, city = ?6, region = ?7, postal_code = ?8, country = ?9,
      email = ?10, phone = ?11, website = ?12, notes = ?13, status = ?14, updated_at = ?15 WHERE id = ?16`).bind(...values, id)
    : env.DB.prepare(`INSERT INTO ministries (
      id, name, name_normalized, description, address_line_1, address_line_2, city, region, postal_code,
      country, email, phone, website, notes, status, created_at, updated_at
    ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16, ?16)`).bind(id, ...values.slice(0, 14), now);
  try {
    const result = await statement.run();
    if (existingId && !result.meta.changes) throw new AdminError(404, "MINISTRY_NOT_FOUND", "That ministry could not be found.");
  } catch (error) {
    if (error instanceof AdminError) throw error;
    if (error instanceof Error && error.message.includes("UNIQUE constraint failed")) throw new AdminError(409, "MINISTRY_EXISTS", "A ministry with that name already exists.");
    throw error;
  }
  await auditStatement(env, "ministry", id, existingId ? "updated_from_trip_workbook" : "created_from_trip_workbook", { tripId, sessionId: session.id }).run();
  return adminJson({ id }, existingId ? 200 : 201);
}

async function saveOrganization(request: Request, env: AdminEnv, tripId: string): Promise<Response> {
  await authenticate(request, env, true);
  await requireTrip(env, tripId);
  const body = await readAdminJson(request);
  const existingMinistryId = uuid(body.id, "existing organization", true);
  const ministryId = uuid(body.ministryId, "organization")!;
  const role = text(body.role, "Organization role", 100);
  const originalRole = existingMinistryId ? text(body.originalRole, "Original organization role", 100) : null;
  const now = new Date().toISOString();
  const statements: D1PreparedStatement[] = [];
  if (existingMinistryId && originalRole) {
    statements.push(env.DB.prepare("DELETE FROM trip_organizations WHERE trip_id = ?1 AND ministry_id = ?2 AND role = ?3").bind(
      tripId, existingMinistryId, originalRole,
    ));
  }
  statements.push(
    env.DB.prepare(`INSERT INTO trip_organizations (trip_id, ministry_id, role, notes, created_at, updated_at)
      VALUES (?1, ?2, ?3, ?4, ?5, ?5)
      ON CONFLICT (trip_id, ministry_id, role) DO UPDATE SET notes = excluded.notes, updated_at = excluded.updated_at`).bind(
      tripId, ministryId, role, optionalText(body.notes, "Notes", 1_000, true), now,
    ),
    auditStatement(env, "trip", tripId, "organization_linked", { ministryId, role }),
  );
  await env.DB.batch(statements);
  return adminJson({ ok: true, id: ministryId });
}

async function saveMember(request: Request, env: AdminEnv, tripId: string): Promise<Response> {
  await authenticate(request, env, true);
  await requireTrip(env, tripId);
  const body = await readAdminJson(request);
  const existingPersonId = uuid(body.id, "existing person", true);
  const personId = uuid(body.personId, "person")!;
  const ministryId = uuid(body.ministryId, "organization", true);
  const role = choice(body.role, "member role", MEMBER_ROLES, "traveler");
  const status = choice(body.status, "member status", MEMBER_STATUSES, "invited");
  const now = new Date().toISOString();
  const statements: D1PreparedStatement[] = [];
  if (existingPersonId && existingPersonId !== personId) {
    statements.push(env.DB.prepare("DELETE FROM trip_members WHERE trip_id = ?1 AND person_id = ?2").bind(tripId, existingPersonId));
  }
  statements.push(
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
  );
  await env.DB.batch(statements);
  return adminJson({ ok: true, id: personId });
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
  const categoryId = recordId(body.categoryId, "cost category")!;
  const category = await env.DB.prepare(
    "SELECT id, system_key FROM trip_cost_categories WHERE id = ?1 AND status = 'active'",
  ).bind(categoryId).first<{ id: string; system_key: string | null }>();
  if (!category) throw new AdminError(422, "COST_CATEGORY_NOT_FOUND", "Choose an active cost category.");
  const calculationMethod = choice(body.calculationMethod, "calculation method", COST_CALCULATION_METHODS, "fixed");
  if (calculationMethod === "percentage_of_individual" && !PERCENTAGE_FEE_CATEGORY_KEYS.has(category.system_key ?? "")) {
    throw new AdminError(422, "PERCENTAGE_CATEGORY_REQUIRED", "Percentage budgeting is available only for Hope Sojourns Leadership Expenses and Administration / Overhead.");
  }
  const percentageRate = calculationMethod === "percentage_of_individual" ? percentage(body.percentageRate, "Percentage rate") : null;
  const quantity = calculationMethod === "percentage_of_individual" ? 1 : positiveNumber(body.quantity, "Quantity");
  const unit = calculationMethod === "percentage_of_individual" ? 0 : money(body.estimatedUnitCost ?? 0, "Estimated unit cost", true);
  const expenseScope = calculationMethod === "fixed"
    ? choice(body.expenseScope, "expense scope", COST_SCOPES, "trip")
    : "individual";
  const suppliedEstimatedTotal = body.estimatedTotal === undefined || body.estimatedTotal === "" ? null : money(body.estimatedTotal, "Estimated total", true);
  const calculated = calculateTripBudgetEstimate(
    { calculationMethod, quantity, estimatedUnitCost: unit, percentageRate },
    trip.paying_traveler_count,
    0,
  );
  const estimatedTotal = calculationMethod === "fixed" && suppliedEstimatedTotal !== null
    ? suppliedEstimatedTotal
    : calculated.estimatedTotal;
  const actualTotal = money(body.actualTotal ?? 0, "Actual total", true);
  const settlementRoute = choice(body.settlementRoute, "settlement route", SETTLEMENT_ROUTES, "through_hs");
  const paymentStatus = choice(body.paymentStatus, "payment status", COST_STATUSES, "planned");
  const paidDate = date(body.paidDate, "paid date");
  if (settlementRoute === "through_hs" && paymentStatus === "paid" && actualTotal > 0 && !paidDate) throw new AdminError(422, "PAID_DATE_REQUIRED", "Enter the date Hope Sojourns paid this expense.");
  const now = new Date().toISOString();
  const values = [
    categoryId, text(body.description, "Description", 240),
    expenseScope, uuid(body.accountId, "trip account", true),
    calculationMethod, percentageRate, quantity, unit, estimatedTotal, actualTotal, optionalText(body.vendorName, "Vendor", 180),
    uuid(body.vendorMinistryId, "vendor organization", true), settlementRoute,
    paymentStatus, optionalText(body.paymentMethod, "Payment method", 80),
    optionalText(body.externalReference, "Reference", 160), date(body.dueDate, "due date"), paidDate,
    existingCost?.ledger_entry_id ?? null, optionalText(body.notes, "Notes", 2_000, true), now,
  ] as const;
  const statement = existingId
    ? env.DB.prepare(`UPDATE trip_cost_items SET category_id = ?1, description = ?2, expense_scope = ?3,
      account_id = ?4, calculation_method = ?5, percentage_rate = ?6, quantity = ?7,
      estimated_unit_cost = ?8, estimated_total = ?9, actual_total = ?10,
      vendor_name = ?11, vendor_ministry_id = ?12, settlement_route = ?13, payment_status = ?14,
      payment_method = ?15, external_reference = ?16, due_date = ?17, paid_date = ?18,
      ledger_entry_id = ?19, notes = ?20, updated_at = ?21 WHERE id = ?22 AND trip_id = ?23`).bind(...values, id, tripId)
    : env.DB.prepare(`INSERT INTO trip_cost_items (
      id, trip_id, category_id, description, expense_scope, account_id, calculation_method, percentage_rate,
      quantity, estimated_unit_cost, estimated_total, actual_total, vendor_name, vendor_ministry_id,
      settlement_route, payment_status, payment_method, external_reference, due_date, paid_date,
      ledger_entry_id, notes, created_at, updated_at
    ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16, ?17, ?18, ?19, ?20, ?21, ?22, ?23, ?23)`).bind(
      id, tripId, ...values.slice(0, 20), now,
    );
  const result = await statement.run();
  if (existingId && !result.meta.changes) throw new AdminError(404, "COST_NOT_FOUND", "That cost item could not be found.");
  await env.DB.prepare("UPDATE trips SET budget_completed_at = NULL, updated_at = ?1 WHERE id = ?2").bind(now, tripId).run();
  await recalculateTripBudget(env, tripId, trip.paying_traveler_count, now);
  await auditStatement(env, "trip_cost_item", id, existingId ? "updated" : "created", {
    tripId, calculationMethod, percentageRate, estimatedTotal, actualTotal,
  }).run();
  await syncPaidTripCostLedger(env, tripId, trip.code, id, session.id);
  return adminJson({ id }, existingId ? 200 : 201);
}

async function updateBudgetPlan(request: Request, env: AdminEnv, tripId: string): Promise<Response> {
  await authenticate(request, env, true);
  const trip = await requireTrip(env, tripId);
  const body = await readAdminJson(request);
  const action = choice(body.action, "budget action", new Set(["save", "complete", "reopen"]), "save");
  const payingTravelerCount = positiveInteger(body.payingTravelerCount ?? trip.paying_traveler_count, "Paying traveler count");
  if (action === "complete") {
    const activeCost = await env.DB.prepare(
      "SELECT id FROM trip_cost_items WHERE trip_id = ?1 AND payment_status != 'canceled' LIMIT 1",
    ).bind(tripId).first();
    if (!activeCost) {
      throw new AdminError(422, "BUDGET_COST_REQUIRED", "Add at least one active budget item before finishing the budget.");
    }
  }
  const now = new Date().toISOString();
  await recalculateTripBudget(env, tripId, payingTravelerCount, now);
  const budgetCompletedAt = action === "complete" ? now : null;
  await env.DB.batch([
    env.DB.prepare(
      "UPDATE trips SET paying_traveler_count = ?1, budget_completed_at = ?2, updated_at = ?3 WHERE id = ?4",
    ).bind(payingTravelerCount, budgetCompletedAt, now, tripId),
    auditStatement(env, "trip", tripId, action === "complete" ? "budget_completed" : action === "reopen" ? "budget_reopened" : "budget_settings_updated", {
      payingTravelerCount,
    }),
  ]);
  return adminJson({ payingTravelerCount, budgetCompletedAt });
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
  const existingId = uuid(body.id, "invitation", true);
  const ministryId = uuid(body.ministryId, "organization", true);
  const label = optionalText(body.label, "Invite label", 160);
  const expiresAt = date(body.expiresAt, "expiration date");
  const maxUses = optionalInteger(body.maxUses, "maximum uses");
  const now = new Date().toISOString();
  if (existingId) {
    const result = await env.DB.prepare(`UPDATE trip_invites SET ministry_id = ?1, label = ?2, expires_at = ?3,
      max_uses = ?4, updated_at = ?5 WHERE id = ?6 AND trip_id = ?7`).bind(
      ministryId, label, expiresAt, maxUses, now, existingId, tripId,
    ).run();
    if (!result.meta.changes) throw new AdminError(404, "INVITE_NOT_FOUND", "That invitation could not be found.");
    await auditStatement(env, "trip_invite", existingId, "updated", { tripId, expiresAt, maxUses }).run();
    return adminJson({ id: existingId }, 200);
  }
  const token = randomToken(24);
  const id = crypto.randomUUID();
  await env.DB.batch([
    env.DB.prepare(`INSERT INTO trip_invites (
      id, trip_id, ministry_id, label, token_hash, expires_at, max_uses, status, created_at, updated_at
    ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, 'active', ?8, ?8)`).bind(
      id, tripId, ministryId, label,
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
  const trip = await requireTrip(env, tripId);
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
  if (resource === "cost-items") {
    const now = new Date().toISOString();
    await env.DB.prepare("UPDATE trips SET budget_completed_at = NULL, updated_at = ?1 WHERE id = ?2").bind(now, tripId).run();
    await recalculateTripBudget(env, tripId, trip.paying_traveler_count, now);
  }
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

const WORKBOOK_META_HEADERS = ["Record ID", "Original Updated At", "Original Fingerprint"];
const TRIP_WORKBOOK_HEADERS = {
  People: ["Import Ref", "First Name", "Preferred Name", "Last Name", "Email", "Phone", "Contact Preference", "Contact Status", "Contact Types", "Organization", "Address Line 1", "Address Line 2", "City", "State Province Region", "Postal Code", "Country", "Website", "School Field Specialty", "Notes", ...WORKBOOK_META_HEADERS],
  Ministries: ["Import Ref", "Organization Name", "Description", "Address Line 1", "Address Line 2", "City", "State Province Region", "Postal Code", "Country", "Email", "Phone", "Website", "Notes", "Status", ...WORKBOOK_META_HEADERS],
  Team: ["Import Ref", "Person Email", "Organization Name", "Role", "Status", "Directory Visible", "Show Email", "Show Phone", "Notes", ...WORKBOOK_META_HEADERS],
  Partners: ["Import Ref", "Organization Name", "Role", "Notes", "Original Role", ...WORKBOOK_META_HEADERS],
  Content: ["Import Ref", "Content Type", "Title", "Content", "Event Date", "Event Time", "Location", "Link URL", "Visibility", "Publication Status", "Sort Order", ...WORKBOOK_META_HEADERS],
  Accounts: ["Import Ref", "Account Type", "Account Name", "Person Email", "Organization Name", "Billing Email", "Billing Phone", "Financial Access", "Status", "Notes", ...WORKBOOK_META_HEADERS],
  Budget: ["Import Ref", "Category Name", "Description", "Expense Scope", "Account Ref", "Calculation Method", "Percentage Rate", "Quantity", "Estimated Unit Cost", "Estimated Total", "Actual Total", "Vendor Name", "Vendor Organization Name", "Settlement Route", "Payment Status", "Payment Method", "External Reference", "Due Date", "Paid Date", "Notes", ...WORKBOOK_META_HEADERS],
  Allocations: ["Import Ref", "Budget Item Ref", "Funding Source Name", "Amount", "Status", "Notes", ...WORKBOOK_META_HEADERS],
  Charges: ["Import Ref", "Account Ref", "Budget Item Ref", "Title", "Purpose", "Amount", "Due Date", "Status", "Notes", ...WORKBOOK_META_HEADERS],
  Support: ["Import Ref", "Account Ref", "Funding Source Name", "Award Type", "Amount", "Award Date", "Status", "Reason", ...WORKBOOK_META_HEADERS],
  Payments: ["Import Ref", "Account Ref", "Funding Source Name", "Transaction Date", "Amount", "Purpose", "Payment Method", "Settlement Route", "Status", "Payer Name", "External Reference", "Source System", "Source Transaction ID", "Charitable Amount", "Charge Ref", "Applied Amount", "Notes", ...WORKBOOK_META_HEADERS],
  Invites: ["Import Ref", "Organization Name", "Label", "Expires Date", "Max Uses", ...WORKBOOK_META_HEADERS],
} as const;

function workbookValue(value: unknown): string {
  if (value === null || value === undefined) return "";
  return String(value);
}

function workbookFlag(value: unknown): string {
  return Number(value) === 1 ? "Yes" : "No";
}

async function exportedWorkbookRow(
  headers: readonly string[],
  cells: Array<unknown>,
  recordId: string,
  updatedAt: string,
): Promise<Array<string>> {
  const values = [...cells.map(workbookValue), recordId, updatedAt];
  const normalized: Record<string, string> = {};
  headers.slice(0, -1).forEach((header, index) => {
    normalized[normalizeSpreadsheetLabel(header)] = values[index] ?? "";
  });
  return [...values, await hashText(JSON.stringify(normalized))];
}

function exportedImportRef(
  imported: Map<string, string>,
  entity: TripImportEntity,
  id: string,
  suffix = "",
): string {
  const mapped = imported.get(`${entity}:${id}`);
  if (mapped && entity !== "partner" && entity !== "member") return mapped;
  const extra = suffix ? `-${suffix.normalize("NFKC").toLocaleLowerCase("en-US").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 24)}` : "";
  return `${entity}-${id}${extra}`.slice(0, 80);
}

function resultRows(result: D1Result<unknown>): JsonRecord[] {
  return result.results as JsonRecord[];
}

async function exportTripSpreadsheet(request: Request, env: AdminEnv, tripId: string): Promise<Response> {
  await authenticate(request, env);
  const trip = await requireTrip(env, tripId);
  const [
    importedResult, peopleResult, ministriesResult, partnersResult, membersResult, contentResult, accountsResult,
    costsResult, allocationsResult, chargesResult, awardsResult, paymentsResult, invitesResult,
  ] = await Promise.all([
    env.DB.prepare("SELECT entity_type, external_key, entity_id FROM trip_bulk_import_rows WHERE trip_id = ?1 AND entity_id IS NOT NULL ORDER BY created_at").bind(tripId).all(),
    env.DB.prepare(`SELECT p.*,
      COALESCE((SELECT group_concat(ordered.contact_type, '; ') FROM (
        SELECT ct.contact_type FROM contact_types ct WHERE ct.person_id = p.id ORDER BY ct.contact_type
      ) ordered), '') AS contact_types
      FROM people p WHERE
        EXISTS (SELECT 1 FROM trip_members tm WHERE tm.trip_id = ?1 AND tm.person_id = p.id)
        OR EXISTS (SELECT 1 FROM trip_accounts ta WHERE ta.trip_id = ?1 AND ta.person_id = p.id)
        OR EXISTS (SELECT 1 FROM trip_bulk_import_rows bi WHERE bi.trip_id = ?1 AND bi.entity_type = 'person' AND bi.entity_id = p.id)
      ORDER BY p.last_name_normalized, p.first_name_normalized`).bind(tripId).all(),
    env.DB.prepare(`SELECT m.* FROM ministries m WHERE
      EXISTS (SELECT 1 FROM trip_organizations org WHERE org.trip_id = ?1 AND org.ministry_id = m.id)
      OR EXISTS (SELECT 1 FROM trip_members tm WHERE tm.trip_id = ?1 AND tm.ministry_id = m.id)
      OR EXISTS (SELECT 1 FROM trip_accounts ta WHERE ta.trip_id = ?1 AND ta.ministry_id = m.id)
      OR EXISTS (SELECT 1 FROM trip_cost_items cost WHERE cost.trip_id = ?1 AND cost.vendor_ministry_id = m.id)
      OR EXISTS (SELECT 1 FROM trip_invites invite WHERE invite.trip_id = ?1 AND invite.ministry_id = m.id)
      OR EXISTS (SELECT 1 FROM trip_bulk_import_rows bi WHERE bi.trip_id = ?1 AND bi.entity_type = 'ministry' AND bi.entity_id = m.id)
      ORDER BY m.name_normalized`).bind(tripId).all(),
    env.DB.prepare(`SELECT o.*, m.name AS ministry_name FROM trip_organizations o JOIN ministries m ON m.id = o.ministry_id
      WHERE o.trip_id = ?1 ORDER BY m.name_normalized, o.role`).bind(tripId).all(),
    env.DB.prepare(`SELECT tm.*, p.email AS person_email, m.name AS ministry_name FROM trip_members tm
      JOIN people p ON p.id = tm.person_id LEFT JOIN ministries m ON m.id = tm.ministry_id
      WHERE tm.trip_id = ?1 ORDER BY p.last_name_normalized, p.first_name_normalized`).bind(tripId).all(),
    env.DB.prepare("SELECT * FROM trip_content WHERE trip_id = ?1 ORDER BY content_type, event_date, sort_order, title").bind(tripId).all(),
    env.DB.prepare(`SELECT a.*, p.email AS person_email, m.name AS ministry_name FROM trip_accounts a
      LEFT JOIN people p ON p.id = a.person_id LEFT JOIN ministries m ON m.id = a.ministry_id
      WHERE a.trip_id = ?1 ORDER BY a.name`).bind(tripId).all(),
    env.DB.prepare(`SELECT c.*, cc.name AS category_name, m.name AS vendor_ministry_name FROM trip_cost_items c
      JOIN trip_cost_categories cc ON cc.id = c.category_id LEFT JOIN ministries m ON m.id = c.vendor_ministry_id
      WHERE c.trip_id = ?1 ORDER BY cc.sort_order, c.created_at`).bind(tripId).all(),
    env.DB.prepare(`SELECT a.*, fs.name AS funding_source_name FROM trip_cost_allocations a
      JOIN trip_cost_items c ON c.id = a.cost_item_id JOIN trip_funding_sources fs ON fs.id = a.funding_source_id
      WHERE c.trip_id = ?1 ORDER BY a.created_at`).bind(tripId).all(),
    env.DB.prepare("SELECT * FROM trip_charges WHERE trip_id = ?1 ORDER BY due_date, created_at").bind(tripId).all(),
    env.DB.prepare(`SELECT a.*, fs.name AS funding_source_name FROM trip_coverage_awards a
      JOIN trip_funding_sources fs ON fs.id = a.funding_source_id WHERE a.trip_id = ?1 ORDER BY a.award_date, a.created_at`).bind(tripId).all(),
    env.DB.prepare(`SELECT p.*, fs.name AS funding_source_name,
      (SELECT pa.charge_id FROM trip_payment_applications pa WHERE pa.payment_id = p.id ORDER BY pa.created_at LIMIT 1) AS charge_id,
      (SELECT pa.amount FROM trip_payment_applications pa WHERE pa.payment_id = p.id ORDER BY pa.created_at LIMIT 1) AS applied_amount
      FROM trip_payments p LEFT JOIN trip_funding_sources fs ON fs.id = p.funding_source_id
      WHERE p.trip_id = ?1 ORDER BY p.transaction_date, p.created_at`).bind(tripId).all(),
    env.DB.prepare(`SELECT i.*, m.name AS ministry_name FROM trip_invites i LEFT JOIN ministries m ON m.id = i.ministry_id
      WHERE i.trip_id = ?1 ORDER BY i.created_at`).bind(tripId).all(),
  ]);
  const imported = new Map<string, string>();
  for (const row of resultRows(importedResult)) {
    if (row.entity_id && !imported.has(`${row.entity_type}:${row.entity_id}`)) {
      imported.set(`${row.entity_type}:${row.entity_id}`, workbookValue(row.external_key));
    }
  }
  const ref = (entity: TripImportEntity, id: unknown, suffix = "") =>
    id ? exportedImportRef(imported, entity, workbookValue(id), suffix) : "";

  const people = await Promise.all(resultRows(peopleResult).map(row => exportedWorkbookRow(
    TRIP_WORKBOOK_HEADERS.People,
    [ref("person", row.id), row.first_name, row.preferred_name, row.last_name, row.email, row.phone,
      row.contact_preference, row.contact_status, row.contact_types, row.organization, row.address_line_1,
      row.address_line_2, row.city, row.region, row.postal_code, row.country, row.website, row.field_of_study, row.notes],
    workbookValue(row.id), workbookValue(row.updated_at),
  )));
  const ministries = await Promise.all(resultRows(ministriesResult).map(row => exportedWorkbookRow(
    TRIP_WORKBOOK_HEADERS.Ministries,
    [ref("ministry", row.id), row.name, row.description, row.address_line_1, row.address_line_2, row.city,
      row.region, row.postal_code, row.country, row.email, row.phone, row.website, row.notes, row.status],
    workbookValue(row.id), workbookValue(row.updated_at),
  )));
  const partners = await Promise.all(resultRows(partnersResult).map(row => exportedWorkbookRow(
    TRIP_WORKBOOK_HEADERS.Partners,
    [ref("partner", row.ministry_id, workbookValue(row.role)), row.ministry_name, row.role, row.notes, row.role],
    workbookValue(row.ministry_id), workbookValue(row.updated_at),
  )));
  const members = await Promise.all(resultRows(membersResult).map(row => exportedWorkbookRow(
    TRIP_WORKBOOK_HEADERS.Team,
    [ref("member", row.person_id), row.person_email, row.ministry_name, row.role, row.status,
      workbookFlag(row.directory_visible), workbookFlag(row.directory_email_visible), workbookFlag(row.directory_phone_visible), row.notes],
    workbookValue(row.person_id), workbookValue(row.updated_at),
  )));
  const content = await Promise.all(resultRows(contentResult).map(row => exportedWorkbookRow(
    TRIP_WORKBOOK_HEADERS.Content,
    [ref("content", row.id), row.content_type, row.title, row.content, row.event_date, row.event_time, row.location,
      row.link_url, row.visibility, row.publication_status, row.sort_order],
    workbookValue(row.id), workbookValue(row.updated_at),
  )));
  const accounts = await Promise.all(resultRows(accountsResult).map(row => exportedWorkbookRow(
    TRIP_WORKBOOK_HEADERS.Accounts,
    [ref("account", row.id), row.account_type, row.name, row.person_email, row.ministry_name, row.billing_email,
      row.billing_phone, row.financial_access, row.status, row.notes],
    workbookValue(row.id), workbookValue(row.updated_at),
  )));
  const costs = await Promise.all(resultRows(costsResult).map(row => exportedWorkbookRow(
    TRIP_WORKBOOK_HEADERS.Budget,
    [ref("cost", row.id), row.category_name, row.description, row.expense_scope, ref("account", row.account_id),
      row.calculation_method, row.percentage_rate, row.quantity, row.estimated_unit_cost, row.estimated_total, row.actual_total, row.vendor_name,
      row.vendor_ministry_name, row.settlement_route, row.payment_status, row.payment_method, row.external_reference,
      row.due_date, row.paid_date, row.notes],
    workbookValue(row.id), workbookValue(row.updated_at),
  )));
  const allocations = await Promise.all(resultRows(allocationsResult).map(row => exportedWorkbookRow(
    TRIP_WORKBOOK_HEADERS.Allocations,
    [ref("allocation", row.id), ref("cost", row.cost_item_id), row.funding_source_name, row.amount, row.status, row.notes],
    workbookValue(row.id), workbookValue(row.updated_at),
  )));
  const charges = await Promise.all(resultRows(chargesResult).map(row => exportedWorkbookRow(
    TRIP_WORKBOOK_HEADERS.Charges,
    [ref("charge", row.id), ref("account", row.account_id), ref("cost", row.cost_item_id), row.title, row.purpose,
      row.amount, row.due_date, row.status, row.notes],
    workbookValue(row.id), workbookValue(row.updated_at),
  )));
  const awards = await Promise.all(resultRows(awardsResult).map(row => exportedWorkbookRow(
    TRIP_WORKBOOK_HEADERS.Support,
    [ref("award", row.id), ref("account", row.account_id), row.funding_source_name, row.award_type, row.amount,
      row.award_date, row.status, row.reason],
    workbookValue(row.id), workbookValue(row.updated_at),
  )));
  const payments = await Promise.all(resultRows(paymentsResult).map(row => exportedWorkbookRow(
    TRIP_WORKBOOK_HEADERS.Payments,
    [ref("payment", row.id), ref("account", row.account_id), row.funding_source_name, row.transaction_date, row.amount,
      row.purpose, row.payment_method, row.settlement_route, row.status, row.payer_name, row.external_reference,
      row.source_system, row.source_transaction_id, row.charitable_amount, ref("charge", row.charge_id), row.applied_amount, row.notes],
    workbookValue(row.id), workbookValue(row.updated_at),
  )));
  const invites = await Promise.all(resultRows(invitesResult).map(row => exportedWorkbookRow(
    TRIP_WORKBOOK_HEADERS.Invites,
    [ref("invite", row.id), row.ministry_name, row.label, row.expires_at, row.max_uses],
    workbookValue(row.id), workbookValue(row.updated_at),
  )));

  const instructions: TripWorkbookSheet = {
    name: "Instructions",
    purpose: `Current trip data for ${trip.code}: ${trip.title}. Edit existing rows or add new rows, then upload this workbook for preview.`,
    guidance: "Do not change gray metadata columns. Preview always shows Create, Update, Unchanged, or Blocked before saving.",
    headers: ["Step", "What to do", "", "Important rule", "Details", "Example"],
    rows: [
      ["1", "Edit current rows or add new rows on any sheet.", "", "People and ministries", "Add them on the People and Ministries sheets before referencing them elsewhere.", "traveler@example.org"],
      ["2", "Keep sheet names and row 4 headers unchanged.", "", "Existing rows", "Never change Record ID, Original Updated At, Original Fingerprint, or Original Role.", "Leave metadata alone"],
      ["3", "Use a unique Import Ref for each new row.", "", "References", "Account Ref, Budget Item Ref, and Charge Ref must match another row's Import Ref.", "cost-airfare-01"],
      ["4", "Upload and choose Preview import.", "", "Safe updates", "Stale rows are blocked if the portal changed after this download.", "Download fresh copy"],
      ["5", "Review Create, Update, Unchanged, and Blocked.", "", "Payments", "Existing payments are audit records and cannot be rewritten; add a correcting row.", "New correction row"],
      ["6", "Choose Import ready rows only after review.", "", "Security", "Never place passwords, card data, bank data, or invitation links here.", "No passwords"],
    ],
  };
  const sheet = (name: keyof typeof TRIP_WORKBOOK_HEADERS, purpose: string, rows: Array<Array<string>>): TripWorkbookSheet => ({
    name, purpose, headers: [...TRIP_WORKBOOK_HEADERS[name]], rows,
  });
  const sheets: TripWorkbookSheet[] = [
    instructions,
    sheet("People", "Create or safely update the trip's traveler and leader contact records.", people),
    sheet("Ministries", "Create or safely update churches, ministries, payers, and logistics partners used by this trip.", ministries),
    sheet("Team", "Connect people to this trip. People listed on the People sheet can be referenced in the same upload.", members),
    sheet("Partners", "Connect ministries, churches, payers, or logistics partners to this trip.", partners),
    sheet("Content", "Maintain itinerary entries, devotionals, instructions, resources, updates, and overview content.", content),
    sheet("Accounts", "Maintain traveler, family, group, organization, or sponsor accounts.", accounts),
    sheet("Budget", "Maintain everything being paid for and who or what covers it.", costs),
    sheet("Allocations", "Maintain funding-source allocations for Budget rows.", allocations),
    sheet("Charges", "Maintain amounts owed by traveler, group, or organization accounts.", charges),
    sheet("Support", "Maintain leader coverage, scholarships, sponsor credits, fee waivers, and other support.", awards),
    sheet("Payments", "Review existing payments and add new payments or corrections. Existing payment rows are immutable.", payments),
    sheet("Invites", "Maintain friendly private interest-link settings. Invitation secrets are never exported.", invites),
  ];
  const bytes = buildTripWorkbook(sheets);
  const safeCode = trip.code.replace(/[^A-Za-z0-9_-]+/g, "-").replace(/^-|-$/g, "") || "Trip";
  return new Response(new Uint8Array(bytes).buffer, { status: 200, headers: {
    "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "Content-Disposition": `attachment; filename="Hope-Sojourns-${safeCode}-Trip-Workbook.xlsx"`,
    "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff",
  } });
}

type TripImportLookups = {
  people: Map<string, string>;
  ministries: Map<string, string>;
  categories: Map<string, string>;
  sources: Map<string, string>;
  importedIds: Map<string, string>;
};

type TripImportPreviewRow = {
  sheet: string;
  rowNumber: number;
  entity: TripImportEntity;
  externalKey: string;
  status: "ready" | "already_loaded" | "conflict" | "error" | "imported" | "not_imported";
  action: "create" | "update" | "unchanged" | "blocked";
  message: string;
  fingerprint: string;
};

function importLookupKey(entity: TripImportEntity, externalKey: string): string {
  return `${entity}:${externalKey.toLocaleLowerCase("en-US")}`;
}

function importValue(row: TripImportRow, header: string, required = false): string {
  const value = row.values[header] ?? "";
  if (required && !value) throw new AdminError(422, "IMPORT_VALUE_REQUIRED", `${header} is required.`);
  return value;
}

function importBoolean(value: string, fallback = false): boolean {
  if (!value) return fallback;
  const normalized = value.toLocaleLowerCase("en-US");
  if (["yes", "y", "true", "1"].includes(normalized)) return true;
  if (["no", "n", "false", "0"].includes(normalized)) return false;
  throw new AdminError(422, "INVALID_IMPORT_VALUE", `Use Yes or No instead of "${value}".`);
}

function importList(value: string): string[] {
  return [...new Set(value.split(/[;,\n]+/).map(item => item.normalize("NFKC").trim().toLocaleLowerCase("en-US")).filter(Boolean))];
}

function importRecordId(row: TripImportRow): string | null {
  const value = importValue(row, "record id");
  return value ? uuid(value, "Record ID") : null;
}

function importFingerprintValues(values: Record<string, string>): Record<string, string> {
  return Object.fromEntries(Object.entries(values).filter(([key]) => key !== "original fingerprint"));
}

function importMasterId(map: Map<string, string>, value: string, label: string, optional = false): string | null {
  if (!value && optional) return null;
  if (!value) throw new AdminError(422, "IMPORT_REFERENCE_REQUIRED", `${label} is required.`);
  const id = map.get(normalizeTripCatalogName(value));
  if (!id) throw new AdminError(422, "IMPORT_REFERENCE_NOT_FOUND", `${label} "${value}" was not found. Create it first, then preview this spreadsheet again.`);
  return id;
}

function importEntityId(lookups: TripImportLookups, entity: TripImportEntity, value: string, label: string, optional = false): string | null {
  if (!value && optional) return null;
  if (!value) throw new AdminError(422, "IMPORT_REFERENCE_REQUIRED", `${label} is required.`);
  const id = lookups.importedIds.get(importLookupKey(entity, value));
  if (!id) throw new AdminError(422, "IMPORT_REFERENCE_NOT_FOUND", `${label} "${value}" was not found in this workbook or an earlier import.`);
  return id;
}

function importDate(row: TripImportRow, header: string, required = false): string {
  const value = importValue(row, header, required);
  return value ? excelDateValue(value) : "";
}

function tripImportPayload(row: TripImportRow, lookups: TripImportLookups): JsonRecord {
  const value = (header: string, required = false) => importValue(row, header, required);
  const id = importRecordId(row) ?? undefined;
  const ministry = (header: string, optional = false) => importMasterId(lookups.ministries, value(header), header, optional);
  const source = (header: string, optional = false) => importMasterId(lookups.sources, value(header), header, optional);
  const account = (header: string, optional = false) => importEntityId(lookups, "account", value(header), header, optional);
  const cost = (header: string, optional = false) => importEntityId(lookups, "cost", value(header), header, optional);
  switch (row.entity) {
    case "person":
      return {
        id,
        firstName: value("first name", true),
        preferredName: value("preferred name"),
        lastName: value("last name", true),
        email: value("email", true),
        phone: value("phone"),
        contactPreference: value("contact preference") || "email",
        contactStatus: value("contact status") || "active",
        contactTypes: importList(value("contact types") || "traveler"),
        organization: value("organization"),
        addressLine1: value("address line 1"),
        addressLine2: value("address line 2"),
        city: value("city"),
        region: value("state province region"),
        postalCode: value("postal code"),
        country: value("country"),
        website: value("website"),
        fieldOfStudy: value("school field specialty"),
        notes: value("notes"),
      };
    case "ministry":
      return {
        id,
        name: value("organization name", true),
        description: value("description"),
        addressLine1: value("address line 1"),
        addressLine2: value("address line 2"),
        city: value("city"),
        region: value("state province region"),
        postalCode: value("postal code"),
        country: value("country"),
        email: value("email"),
        phone: value("phone"),
        website: value("website"),
        notes: value("notes"),
        status: value("status") || "active",
      };
    case "partner":
      return {
        id,
        ministryId: ministry("organization name"),
        role: value("role", true),
        originalRole: value("original role") || value("role", true),
        notes: value("notes"),
      };
    case "member":
      return {
        id,
        personId: importMasterId(lookups.people, value("person email", true), "person email"),
        ministryId: ministry("organization name", true),
        role: value("role") || "traveler",
        status: value("status") || "invited",
        directoryVisible: importBoolean(value("directory visible"), true),
        directoryEmailVisible: importBoolean(value("show email"), false),
        directoryPhoneVisible: importBoolean(value("show phone"), false),
        notes: value("notes"),
      };
    case "content":
      return {
        id,
        contentType: value("content type", true),
        title: value("title", true),
        content: value("content"),
        eventDate: importDate(row, "event date"),
        eventTime: value("event time"),
        location: value("location"),
        linkUrl: value("link url"),
        visibility: value("visibility") || "travelers",
        publicationStatus: value("publication status") || "draft",
        sortOrder: value("sort order") || "0",
      };
    case "account":
      return {
        id,
        accountType: value("account type", true),
        name: value("account name", true),
        personId: importMasterId(lookups.people, value("person email"), "person email", true),
        ministryId: ministry("organization name", true),
        billingEmail: value("billing email"),
        billingPhone: value("billing phone"),
        financialAccess: value("financial access") || "private_link",
        status: value("status") || "active",
        notes: value("notes"),
      };
    case "cost":
      return {
        id,
        categoryId: importMasterId(lookups.categories, value("category name", true), "category name"),
        description: value("description", true),
        expenseScope: value("expense scope") || "trip",
        accountId: account("account ref", true),
        calculationMethod: value("calculation method") || "fixed",
        percentageRate: value("percentage rate"),
        quantity: value("quantity") || "1",
        estimatedUnitCost: value("estimated unit cost") || "0",
        estimatedTotal: value("estimated total"),
        actualTotal: value("actual total") || "0",
        vendorName: value("vendor name"),
        vendorMinistryId: ministry("vendor organization name", true),
        settlementRoute: value("settlement route") || "through_hs",
        paymentStatus: value("payment status") || "planned",
        paymentMethod: value("payment method"),
        externalReference: value("external reference"),
        dueDate: importDate(row, "due date"),
        paidDate: importDate(row, "paid date"),
        notes: value("notes"),
      };
    case "allocation":
      return {
        id,
        costItemId: cost("budget item ref"),
        fundingSourceId: source("funding source name"),
        amount: value("amount", true),
        status: value("status") || "planned",
        notes: value("notes"),
      };
    case "charge":
      return {
        id,
        accountId: account("account ref"),
        costItemId: cost("budget item ref", true),
        title: value("title", true),
        purpose: value("purpose") || "trip_payment",
        amount: value("amount", true),
        dueDate: importDate(row, "due date"),
        status: value("status") || "open",
        notes: value("notes"),
      };
    case "award":
      return {
        id,
        accountId: account("account ref"),
        fundingSourceId: source("funding source name"),
        awardType: value("award type", true),
        amount: value("amount", true),
        awardDate: importDate(row, "award date", true),
        status: value("status") || "approved",
        reason: value("reason"),
      };
    case "payment":
      return {
        id,
        accountId: account("account ref", true),
        fundingSourceId: source("funding source name", true),
        transactionDate: importDate(row, "transaction date", true),
        amount: value("amount", true),
        purpose: value("purpose") || "trip_payment",
        paymentMethod: value("payment method", true),
        settlementRoute: value("settlement route") || "through_hs",
        status: value("status") || "received",
        payerName: value("payer name"),
        externalReference: value("external reference"),
        sourceSystem: value("source system") || "import",
        sourceTransactionId: value("source transaction id"),
        charitableAmount: value("charitable amount") || "0",
        chargeId: importEntityId(lookups, "charge", value("charge ref"), "charge ref", true),
        appliedAmount: value("applied amount"),
        notes: value("notes"),
      };
    case "invite":
      return {
        id,
        ministryId: ministry("organization name", true),
        label: value("label"),
        expiresAt: importDate(row, "expires date"),
        maxUses: value("max uses"),
      };
  }
}

function importRequest(original: Request, payload: JsonRecord): Request {
  const headers = new Headers(original.headers);
  headers.set("Content-Type", "application/json");
  headers.delete("Content-Length");
  return new Request(original.url, { method: "POST", headers, body: JSON.stringify(payload) });
}

async function invokeTripImportRow(request: Request, env: AdminEnv, tripId: string, row: TripImportRow, payload: JsonRecord): Promise<Response> {
  const handlers: Record<TripImportEntity, (request: Request, env: AdminEnv, tripId: string) => Promise<Response>> = {
    person: saveImportedPerson,
    ministry: saveImportedMinistry,
    partner: saveOrganization,
    member: saveMember,
    content: saveContent,
    account: saveAccount,
    cost: saveCostItem,
    allocation: saveAllocation,
    charge: saveCharge,
    award: saveAward,
    payment: savePayment,
    invite: createInvite,
  };
  return handlers[row.entity](importRequest(request, payload), env, tripId);
}

function tripImportSummary(rows: TripImportPreviewRow[]): Record<string, number> {
  return rows.reduce<Record<string, number>>((summary, row) => {
    summary[row.status] = (summary[row.status] ?? 0) + 1;
    return summary;
  }, { total: rows.length });
}

const TRIP_IMPORT_SNAPSHOT_QUERIES: Record<TripImportEntity, { select: string; tripScoped: boolean }> = {
  person: { select: "SELECT id, updated_at FROM people WHERE id IN (__IDS__)", tripScoped: false },
  ministry: { select: "SELECT id, updated_at FROM ministries WHERE id IN (__IDS__)", tripScoped: false },
  partner: { select: "SELECT ministry_id AS id, role, updated_at FROM trip_organizations WHERE trip_id = ?1 AND ministry_id IN (__IDS__)", tripScoped: true },
  member: { select: "SELECT person_id AS id, updated_at FROM trip_members WHERE trip_id = ?1 AND person_id IN (__IDS__)", tripScoped: true },
  content: { select: "SELECT id, updated_at FROM trip_content WHERE trip_id = ?1 AND id IN (__IDS__)", tripScoped: true },
  account: { select: "SELECT id, updated_at FROM trip_accounts WHERE trip_id = ?1 AND id IN (__IDS__)", tripScoped: true },
  cost: { select: "SELECT id, updated_at FROM trip_cost_items WHERE trip_id = ?1 AND id IN (__IDS__)", tripScoped: true },
  allocation: { select: "SELECT a.id, a.updated_at FROM trip_cost_allocations a JOIN trip_cost_items c ON c.id = a.cost_item_id WHERE c.trip_id = ?1 AND a.id IN (__IDS__)", tripScoped: true },
  charge: { select: "SELECT id, updated_at FROM trip_charges WHERE trip_id = ?1 AND id IN (__IDS__)", tripScoped: true },
  award: { select: "SELECT id, updated_at FROM trip_coverage_awards WHERE trip_id = ?1 AND id IN (__IDS__)", tripScoped: true },
  payment: { select: "SELECT id, updated_at FROM trip_payments WHERE trip_id = ?1 AND id IN (__IDS__)", tripScoped: true },
  invite: { select: "SELECT id, updated_at FROM trip_invites WHERE trip_id = ?1 AND id IN (__IDS__)", tripScoped: true },
};

async function loadTripImportSnapshots(env: AdminEnv, tripId: string, rows: TripImportRow[]): Promise<Map<string, string>> {
  const grouped = new Map<TripImportEntity, string[]>();
  for (const row of rows) {
    const id = row.values["record id"] ?? "";
    if (!/^[0-9a-f-]{36}$/i.test(id)) continue;
    const ids = grouped.get(row.entity) ?? [];
    if (!ids.includes(id)) ids.push(id);
    grouped.set(row.entity, ids);
  }
  const snapshots = new Map<string, string>();
  for (const [entity, ids] of grouped) {
    const spec = TRIP_IMPORT_SNAPSHOT_QUERIES[entity];
    for (let offset = 0; offset < ids.length; offset += 50) {
      const chunk = ids.slice(offset, offset + 50);
      const start = spec.tripScoped ? 2 : 1;
      const placeholders = chunk.map((_, index) => `?${start + index}`).join(", ");
      const query = spec.select.replace("__IDS__", placeholders);
      const bindings = spec.tripScoped ? [tripId, ...chunk] : chunk;
      const result = await env.DB.prepare(query).bind(...bindings).all<{ id: string; updated_at: string; role?: string }>();
      for (const record of result.results) {
        const suffix = entity === "partner" ? `:${normalizeTripCatalogName(record.role ?? "")}` : "";
        snapshots.set(`${entity}:${record.id}${suffix}`, record.updated_at);
      }
    }
  }
  return snapshots;
}

async function importTripSpreadsheet(request: Request, env: AdminEnv, tripId: string): Promise<Response> {
  await authenticate(request, env, true);
  await requireTrip(env, tripId);
  const mediaType = request.headers.get("content-type")?.split(";", 1)[0].trim().toLocaleLowerCase("en-US");
  if (mediaType !== "multipart/form-data") throw new AdminError(415, "UNSUPPORTED_MEDIA_TYPE", "Upload the Excel template as a spreadsheet file.");
  const contentLength = Number(request.headers.get("content-length") ?? 0);
  if (Number.isFinite(contentLength) && contentLength > SPREADSHEET_MAX_FILE_BYTES + 128 * 1024) {
    throw new AdminError(413, "FILE_TOO_LARGE", "Choose a spreadsheet smaller than 3 MB.");
  }
  const form = await request.formData();
  const fileValue = form.get("file");
  if (!fileValue || typeof fileValue === "string") throw new AdminError(422, "FILE_REQUIRED", "Choose a completed Hope Sojourns Excel template.");
  const commit = form.get("commit") === "true";
  let rows: TripImportRow[];
  try {
    const sheets = readSpreadsheet(fileValue.name, new Uint8Array(await fileValue.arrayBuffer()));
    rows = parseTripImportSheets(sheets, 200);
  } catch (error) {
    if (error instanceof SpreadsheetFileError) throw new AdminError(error.status, error.code, error.message);
    throw error;
  }
  if (!rows.length) throw new AdminError(422, "NO_IMPORT_ROWS", "Enter at least one row in People, Ministries, Team, Partners, Content, Budget, Allocations, Accounts, Charges, Support, Payments, or Invites.");

  const [existingResult, peopleResult, ministriesResult, categoriesResult, sourcesResult, snapshots] = await Promise.all([
    env.DB.prepare("SELECT entity_type, external_key, entity_id, content_fingerprint FROM trip_bulk_import_rows WHERE trip_id = ?1").bind(tripId).all<{
      entity_type: TripImportEntity; external_key: string; entity_id: string | null; content_fingerprint: string;
    }>(),
    env.DB.prepare("SELECT id, email FROM people WHERE email IS NOT NULL AND contact_status != 'archived'").all<{ id: string; email: string }>(),
    env.DB.prepare("SELECT id, name_normalized FROM ministries WHERE status != 'archived'").all<{ id: string; name_normalized: string }>(),
    env.DB.prepare("SELECT id, name_normalized FROM trip_cost_categories WHERE status = 'active'").all<{ id: string; name_normalized: string }>(),
    env.DB.prepare("SELECT id, name_normalized FROM trip_funding_sources WHERE status = 'active'").all<{ id: string; name_normalized: string }>(),
    loadTripImportSnapshots(env, tripId, rows),
  ]);
  const existing = new Map(existingResult.results.map(item => [importLookupKey(item.entity_type, item.external_key), item]));
  const importedIds = new Map<string, string>();
  for (const item of existingResult.results) if (item.entity_id) importedIds.set(importLookupKey(item.entity_type, item.external_key), item.entity_id);
  for (const row of rows) {
    if (existing.has(importLookupKey(row.entity, row.externalKey))) continue;
    const recordId = row.values["record id"];
    importedIds.set(importLookupKey(row.entity, row.externalKey), /^[0-9a-f-]{36}$/i.test(recordId) ? recordId : crypto.randomUUID());
  }
  const lookups: TripImportLookups = {
    people: new Map(peopleResult.results.map(item => [normalizeTripCatalogName(item.email), item.id])),
    ministries: new Map(ministriesResult.results.map(item => [item.name_normalized, item.id])),
    categories: new Map(categoriesResult.results.map(item => [item.name_normalized, item.id])),
    sources: new Map(sourcesResult.results.map(item => [item.name_normalized, item.id])),
    importedIds,
  };

  const previewRows: TripImportPreviewRow[] = [];
  for (const row of rows) {
    const fingerprint = await hashText(JSON.stringify(importFingerprintValues(row.values)));
    const prior = existing.get(importLookupKey(row.entity, row.externalKey));
    const originalUpdatedAt = row.values["original updated at"] ?? "";
    const originalFingerprint = row.values["original fingerprint"] ?? "";
    try {
      const payload = tripImportPayload(row, lookups);
      const recordId = importRecordId(row);
      if (recordId) {
        const suffix = row.entity === "partner" ? `:${normalizeTripCatalogName(row.values["original role"] || row.values.role || "")}` : "";
        const currentUpdatedAt = snapshots.get(`${row.entity}:${recordId}${suffix}`);
        if (!currentUpdatedAt) throw new AdminError(422, "IMPORT_RECORD_NOT_FOUND", "This exported record no longer exists in this trip.");
        if (!originalUpdatedAt || !originalFingerprint) throw new AdminError(422, "IMPORT_METADATA_REQUIRED", "Keep the exported Record ID, Original Updated At, and Original Fingerprint cells unchanged.");
        if (currentUpdatedAt !== originalUpdatedAt) {
          if (prior?.content_fingerprint === fingerprint) {
            previewRows.push({
              sheet: row.sheet, rowNumber: row.rowNumber, entity: row.entity, externalKey: row.externalKey, fingerprint,
              status: "already_loaded", action: "unchanged", message: "This exact update was already imported.",
            });
            continue;
          }
          previewRows.push({
            sheet: row.sheet, rowNumber: row.rowNumber, entity: row.entity, externalKey: row.externalKey, fingerprint,
            status: "conflict", action: "blocked",
            message: "This record changed in the portal after the workbook was downloaded. Download a fresh workbook and apply the edit again.",
          });
          continue;
        }
        if (fingerprint === originalFingerprint) {
          previewRows.push({
            sheet: row.sheet, rowNumber: row.rowNumber, entity: row.entity, externalKey: row.externalKey, fingerprint,
            status: "already_loaded", action: "unchanged", message: "No changes detected.",
          });
          continue;
        }
        if (row.entity === "payment") {
          previewRows.push({
            sheet: row.sheet, rowNumber: row.rowNumber, entity: row.entity, externalKey: row.externalKey, fingerprint,
            status: "conflict", action: "blocked",
            message: "Existing payments cannot be rewritten. Leave this row unchanged and add a new correction or reversal row.",
          });
          continue;
        }
        previewRows.push({
          sheet: row.sheet, rowNumber: row.rowNumber, entity: row.entity, externalKey: row.externalKey, fingerprint,
          status: "ready", action: "update", message: "Ready to update the existing record.",
        });
      } else if (prior) {
        previewRows.push({
          sheet: row.sheet, rowNumber: row.rowNumber, entity: row.entity, externalKey: row.externalKey, fingerprint,
          status: prior.content_fingerprint === fingerprint ? "already_loaded" : "conflict",
          action: prior.content_fingerprint === fingerprint ? "unchanged" : "blocked",
          message: prior.content_fingerprint === fingerprint
            ? "This exact row was already imported."
            : "This Import Ref was used earlier with different values. Download the current trip workbook before editing an existing row.",
        });
      } else {
        previewRows.push({
          sheet: row.sheet, rowNumber: row.rowNumber, entity: row.entity, externalKey: row.externalKey, fingerprint,
          status: "ready", action: "create", message: "Ready to create a new record.",
        });
      }
      const futureId = importedIds.get(importLookupKey(row.entity, row.externalKey));
      if (futureId && row.entity === "person") lookups.people.set(normalizeTripCatalogName(String(payload.email)), futureId);
      if (futureId && row.entity === "ministry") lookups.ministries.set(normalizeTripCatalogName(String(payload.name)), futureId);
    } catch (error) {
      previewRows.push({
        sheet: row.sheet, rowNumber: row.rowNumber, entity: row.entity, externalKey: row.externalKey, fingerprint,
        status: "error", action: "blocked", message: error instanceof Error ? error.message : "This row is not valid.",
      });
    }
  }

  const blockers = previewRows.filter(row => row.status === "error" || row.status === "conflict");
  if (!commit) {
    return adminJson({
      mode: "preview",
      canCommit: blockers.length === 0 && previewRows.some(row => row.status === "ready"),
      summary: tripImportSummary(previewRows),
      rows: previewRows,
    });
  }
  if (blockers.length) {
    return adminJson({
      mode: "preview",
      canCommit: false,
      error: "Resolve the highlighted spreadsheet rows before importing.",
      summary: tripImportSummary(previewRows),
      rows: previewRows,
    }, 422);
  }

  const invitations: Array<{ label: string; path: string }> = [];
  let stopped = false;
  for (let index = 0; index < rows.length; index += 1) {
    const row = rows[index];
    const preview = previewRows[index];
    if (preview.status !== "ready") continue;
    if (stopped) {
      preview.status = "not_imported";
      preview.message = "Not imported because an earlier row needs attention.";
      continue;
    }
    try {
      const payload = tripImportPayload(row, lookups);
      const response = await invokeTripImportRow(request, env, tripId, row, payload);
      const result = await response.json() as JsonRecord;
      if (!response.ok) throw new AdminError(response.status, String(result.code ?? "IMPORT_ROW_FAILED"), String(result.error ?? "This row could not be imported."));
      const entityId = typeof result.id === "string" ? result.id : tripId;
      lookups.importedIds.set(importLookupKey(row.entity, row.externalKey), entityId);
      if (row.entity === "person") lookups.people.set(normalizeTripCatalogName(String(payload.email)), entityId);
      if (row.entity === "ministry") lookups.ministries.set(normalizeTripCatalogName(String(payload.name)), entityId);
      await env.DB.prepare(`INSERT INTO trip_bulk_import_rows (
        id, trip_id, entity_type, external_key, entity_id, content_fingerprint, source_file_name, source_sheet, source_row, created_at
      ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)
      ON CONFLICT (trip_id, entity_type, external_key) DO UPDATE SET entity_id = excluded.entity_id,
        content_fingerprint = excluded.content_fingerprint, source_file_name = excluded.source_file_name,
        source_sheet = excluded.source_sheet, source_row = excluded.source_row, created_at = excluded.created_at`).bind(
        crypto.randomUUID(), tripId, row.entity, row.externalKey, entityId, preview.fingerprint,
        fileValue.name.slice(0, 240), row.sheet.slice(0, 80), row.rowNumber, new Date().toISOString(),
      ).run();
      preview.status = "imported";
      preview.message = preview.action === "update" ? "Updated successfully." : "Created successfully.";
      if (row.entity === "invite" && typeof result.path === "string") invitations.push({ label: String(payload.label || row.externalKey), path: result.path });
    } catch (error) {
      preview.status = "error";
      preview.message = error instanceof Error ? error.message : "This row could not be imported.";
      stopped = true;
    }
  }
  await auditStatement(env, "trip", tripId, "spreadsheet_imported", {
    fileName: fileValue.name.slice(0, 240),
    imported: previewRows.filter(row => row.status === "imported").length,
  }).run();
  return adminJson({
    mode: "commit",
    canCommit: false,
    summary: tripImportSummary(previewRows),
    rows: previewRows,
    invitations,
    message: stopped ? "Some rows were imported before a row needed attention. Correct it and import the same file again; completed rows will be skipped." : "Spreadsheet import complete.",
  });
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

  const budgetPlan = path.match(/^\/admin\/trips\/([0-9a-f-]{36})\/budget-plan$/i);
  if (budgetPlan && request.method === "POST") return updateBudgetPlan(request, env, budgetPlan[1]);

  const spreadsheetImport = path.match(/^\/admin\/trips\/([0-9a-f-]{36})\/import$/i);
  if (spreadsheetImport && request.method === "POST") return importTripSpreadsheet(request, env, spreadsheetImport[1]);
  const spreadsheetExport = path.match(/^\/admin\/trips\/([0-9a-f-]{36})\/export$/i);
  if (spreadsheetExport && request.method === "GET") return exportTripSpreadsheet(request, env, spreadsheetExport[1]);

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
    if (request.method === "GET" && path === "/public/trips") return await listPublicTrips(env, request);
    const publicMatch = path.match(/^\/public\/trips\/([a-z0-9-]+)$/);
    if (request.method === "GET" && publicMatch) return await publicTrip(env, publicMatch[1]);
    if (request.method === "POST" && path === "/portal/login") return await portalLogin(request, env);
    if (request.method === "GET" && path === "/portal/session") return await portalSession(request, env);
    if (request.method === "POST" && path === "/portal/logout") return await portalLogout(request, env);
    const accountMatch = path.match(/^\/private-account\/([A-Za-z0-9_-]{40,100})$/);
    if (request.method === "GET" && accountMatch) return await privateAccountStatement(request, env, accountMatch[1]);
    throw new AdminError(404, "NOT_FOUND", "Not found.");
  } catch (error) {
    if (error instanceof AdminError) return adminJson({ error: error.message, code: error.code }, error.status, error.headers);
    console.error(JSON.stringify({ event: "trip_public_unhandled_error", message: error instanceof Error ? error.message : "Unknown error" }));
    return adminJson({ error: "The trip service encountered an unexpected error.", code: "SERVER_ERROR" }, 500);
  }
}
