import { handleAdminRequest } from "./admin";
import { handleCsmAdminRequest, handleCsmDelivery } from "./csm-distribution";
import { handleLedgerAdminRequest } from "./ledger-admin";
import { handleTripAdminRequest, handleTripPublicRequest } from "./trip-platform";

const MAX_BODY_BYTES = 32 * 1024;
const MAX_OPPORTUNITIES = 12;

type ContactPreference = "email" | "phone";
type FieldErrors = Record<string, string>;

type InterestSubmission = {
  firstName: string;
  lastName: string;
  firstNameNormalized: string;
  lastNameNormalized: string;
  email: string;
  emailNormalized: string;
  phone: string;
  phoneNormalized: string;
  contactPreference: ContactPreference;
  fieldOfStudy: string | null;
  preferredTiming: string | null;
  message: string | null;
  opportunities: string[];
  tripId: string | null;
  inviteToken: string | null;
  idempotencyKey: string;
};

type OpportunityRow = {
  id: string;
  slug: string;
  kind: "trip" | "internship";
  title: string;
  location: string;
  partner: string | null;
  duration: string | null;
  sort_order: number;
};

type ExistingSubmissionRow = {
  id: string;
  idempotency_key: string;
  request_fingerprint: string;
  result_json: string | null;
};

class HttpError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly fieldErrors?: FieldErrors,
  ) {
    super(message);
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function cleanSingleLine(value: unknown, maximum: number): string | null {
  if (typeof value !== "string") return null;
  const cleaned = value.normalize("NFKC").replace(/\s+/g, " ").trim();
  if (!cleaned || cleaned.length > maximum || /[\u0000-\u001F\u007F]/.test(cleaned)) return null;
  return cleaned;
}

function cleanOptionalSingleLine(value: unknown, maximum: number): string | null {
  if (value === undefined || value === null || value === "") return null;
  return cleanSingleLine(value, maximum);
}

function cleanOptionalMessage(value: unknown): string | null {
  if (value === undefined || value === null || value === "") return null;
  if (typeof value !== "string") return null;
  const cleaned = value.normalize("NFKC").replace(/\r\n?/g, "\n").trim();
  if (!cleaned || cleaned.length > 1500 || /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/.test(cleaned)) return null;
  return cleaned;
}

function normalizeName(value: string): string {
  return value.normalize("NFKC").toLocaleLowerCase("en-US").replace(/\s+/g, " ").trim();
}

export function normalizeEmail(value: string): string {
  return value.normalize("NFKC").trim().toLocaleLowerCase("en-US");
}

export function normalizePhone(value: string): string | null {
  const digits = value.replace(/\D/g, "");
  return digits.length >= 7 && digits.length <= 18 ? digits : null;
}

function validateName(value: unknown, field: string, errors: FieldErrors): string | null {
  const cleaned = cleanSingleLine(value, 70);
  if (!cleaned || !/\p{L}/u.test(cleaned)) {
    errors[field] = "Enter a name using 70 characters or fewer.";
    return null;
  }
  return cleaned;
}

function validateEmail(value: unknown, errors: FieldErrors): { display: string; normalized: string } | null {
  const display = cleanSingleLine(value, 254);
  if (!display) {
    errors.email = "Enter your email address.";
    return null;
  }
  const normalized = normalizeEmail(display);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(normalized)) {
    errors.email = "Enter a valid email address.";
    return null;
  }
  return { display, normalized };
}

function validatePhone(value: unknown, errors: FieldErrors): { display: string; normalized: string } | null {
  if (value === undefined || value === null || value === "") {
    errors.phone = "Enter your cell phone number.";
    return null;
  }
  const display = cleanSingleLine(value, 40);
  if (!display || !/^[0-9+().\-\s]*(?:(?:x|ext\.?)\s*\d{1,6})?$/i.test(display)) {
    errors.phone = "Enter a valid cell phone number.";
    return null;
  }
  const normalized = normalizePhone(display);
  if (!normalized) {
    errors.phone = "Enter a cell phone number with 7 to 18 digits.";
    return null;
  }
  return { display, normalized };
}

function validateOpportunities(value: unknown, errors: FieldErrors): string[] {
  if (!Array.isArray(value)) {
    errors.opportunities = "Choose at least one trip or internship.";
    return [];
  }
  const items = value.filter((item): item is string => typeof item === "string").map(item => item.trim());
  const invalidItem = items.length !== value.length || items.some(item => !/^[a-z0-9-]{3,80}$/.test(item));
  const unique = [...new Set(items)].sort();
  if (unique.length === 0) errors.opportunities = "Choose at least one trip or internship.";
  if (invalidItem) errors.opportunities = "Refresh the page and choose from the current opportunities.";
  if (unique.length > MAX_OPPORTUNITIES) errors.opportunities = `Choose no more than ${MAX_OPPORTUNITIES} opportunities.`;
  return unique.slice(0, MAX_OPPORTUNITIES);
}

export function validateSubmissionPayload(value: unknown): InterestSubmission {
  if (!isRecord(value)) throw new HttpError(400, "INVALID_REQUEST", "The form submission was not valid.");
  const errors: FieldErrors = {};
  const firstName = validateName(value.firstName, "firstName", errors);
  const lastName = validateName(value.lastName, "lastName", errors);
  const email = validateEmail(value.email, errors);
  const phone = validatePhone(value.phone, errors);
  const contactPreference = value.contactPreference === "phone" ? "phone" : value.contactPreference === "email" ? "email" : null;
  if (!contactPreference) errors.contactPreference = "Choose how you prefer to be contacted.";

  const fieldOfStudy = cleanOptionalSingleLine(value.fieldOfStudy, 140);
  if (value.fieldOfStudy && !fieldOfStudy) errors.fieldOfStudy = "Use 140 characters or fewer.";
  const preferredTiming = cleanOptionalSingleLine(value.preferredTiming, 140);
  if (value.preferredTiming && !preferredTiming) errors.preferredTiming = "Use 140 characters or fewer.";
  const message = cleanOptionalMessage(value.message);
  if (value.message && !message) errors.message = "Use 1,500 characters or fewer.";
  const opportunities = validateOpportunities(value.opportunities, errors);
  const idempotencyKey = cleanSingleLine(value.idempotencyKey, 100);
  if (!idempotencyKey || !/^[A-Za-z0-9_-]{16,100}$/.test(idempotencyKey)) errors.form = "Refresh the page and try again.";
  if (value.consent !== true) errors.consent = "Confirm that Hope Sojourns may contact you.";
  const tripId = cleanOptionalSingleLine(value.tripId, 100);
  if (value.tripId && (!tripId || !/^[0-9a-f-]{36}$/i.test(tripId))) errors.form = "The selected trip link is not valid.";
  const inviteToken = cleanOptionalSingleLine(value.inviteToken, 100);
  if (value.inviteToken && (!inviteToken || !/^[A-Za-z0-9_-]{20,100}$/.test(inviteToken))) {
    errors.form = "The invitation link is not valid.";
  }


  if (Object.keys(errors).length > 0 || !firstName || !lastName || !email || !phone || !contactPreference || !idempotencyKey) {
    throw new HttpError(422, "VALIDATION_ERROR", "Please review the highlighted fields.", errors);
  }

  return {
    firstName,
    lastName,
    firstNameNormalized: normalizeName(firstName),
    lastNameNormalized: normalizeName(lastName),
    email: email.display,
    emailNormalized: email.normalized,
    phone: phone.display,
    phoneNormalized: phone.normalized,
    contactPreference,
    fieldOfStudy,
    preferredTiming,
    message,
    opportunities,
    idempotencyKey,
    tripId,
    inviteToken,
  };
}

async function readLimitedJson(request: Request): Promise<unknown> {
  const contentType = request.headers.get("content-type")?.split(";", 1)[0].trim().toLowerCase();
  if (contentType !== "application/json") throw new HttpError(415, "UNSUPPORTED_MEDIA_TYPE", "Send the form as JSON.");
  const contentLength = Number(request.headers.get("content-length") ?? 0);
  if (Number.isFinite(contentLength) && contentLength > MAX_BODY_BYTES) {
    throw new HttpError(413, "REQUEST_TOO_LARGE", "The form submission is too large.");
  }
  if (!request.body) throw new HttpError(400, "INVALID_REQUEST", "The form submission was empty.");

  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > MAX_BODY_BYTES) throw new HttpError(413, "REQUEST_TOO_LARGE", "The form submission is too large.");
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }

  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  try {
    return JSON.parse(new TextDecoder().decode(bytes)) as unknown;
  } catch {
    throw new HttpError(400, "INVALID_JSON", "The form submission could not be read.");
  }
}

function bytesToHex(bytes: ArrayBuffer): string {
  return [...new Uint8Array(bytes)].map(byte => byte.toString(16).padStart(2, "0")).join("");
}

async function requestFingerprint(input: InterestSubmission): Promise<string> {
  const stable = JSON.stringify({
    identity: [input.emailNormalized, input.firstNameNormalized, input.lastNameNormalized],
    phone: input.phoneNormalized,
    contactPreference: input.contactPreference,
    fieldOfStudy: input.fieldOfStudy?.toLocaleLowerCase("en-US") ?? null,
    preferredTiming: input.preferredTiming?.toLocaleLowerCase("en-US") ?? null,
    message: input.message,
    opportunities: input.opportunities,
    tripId: input.tripId,
  });
  return bytesToHex(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(stable)));
}

async function base64UrlHash(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  let binary = "";
  for (const byte of new Uint8Array(digest)) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

export function isAllowedOrigin(origin: string | null, configuredOrigins: string): boolean {
  if (!origin) return false;
  let candidate: URL;
  try {
    candidate = new URL(origin);
  } catch {
    return false;
  }
  return configuredOrigins.split(",").map(value => value.trim()).filter(Boolean).some(allowed => {
    if (allowed === origin) return true;
    if (allowed === "http://localhost:*") return candidate.protocol === "http:" && candidate.hostname === "localhost";
    if (allowed === "http://127.0.0.1:*") return candidate.protocol === "http:" && candidate.hostname === "127.0.0.1";
    return false;
  });
}

function corsHeaders(request: Request, env: Env): Headers {
  const headers = new Headers({
    "Access-Control-Allow-Headers": "Content-Type, Idempotency-Key, X-CSRF-Token",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Cache-Control": "no-store",
    "Vary": "Origin",
    "X-Content-Type-Options": "nosniff",
  });
  const origin = request.headers.get("origin");
  if (isAllowedOrigin(origin, env.ALLOWED_ORIGINS)) headers.set("Access-Control-Allow-Origin", origin ?? "");
  return headers;
}

function json(request: Request, env: Env, body: unknown, status = 200): Response {
  const headers = corsHeaders(request, env);
  headers.set("Content-Type", "application/json; charset=utf-8");
  return Response.json(body, { status, headers });
}

export function routePath(pathname: string): string {
  if (pathname === "/api/interest") return "/";
  if (pathname.startsWith("/api/interest/")) return pathname.slice("/api/interest".length);
  return pathname;
}

function sourcePage(referer: string | null): string | null {
  if (!referer) return null;
  try {
    const url = new URL(referer);
    return `${url.origin}${url.pathname}`.slice(0, 300);
  } catch {
    return null;
  }
}

async function findExistingSubmission(env: Env, idempotencyKey: string, fingerprint: string): Promise<ExistingSubmissionRow | null> {
  return env.DB.prepare(
    "SELECT id, idempotency_key, request_fingerprint, result_json FROM interest_submissions WHERE idempotency_key = ?1 OR request_fingerprint = ?2 LIMIT 1",
  ).bind(idempotencyKey, fingerprint).first<ExistingSubmissionRow>();
}

function existingSubmissionResult(
  request: Request,
  env: Env,
  existing: ExistingSubmissionRow,
  idempotencyKey: string,
  fingerprint: string,
): Response {
  if (existing.idempotency_key === idempotencyKey && existing.request_fingerprint !== fingerprint) {
    return json(request, env, {
      error: "This form session was already used. Refresh the page and try again.",
      code: "IDEMPOTENCY_KEY_REUSED",
    }, 409);
  }
  if (existing.idempotency_key === idempotencyKey && existing.request_fingerprint === fingerprint) {
    if (existing.result_json) {
      try {
        return json(request, env, { ...JSON.parse(existing.result_json) as Record<string, unknown>, replayed: true });
      } catch {
        // Fall through to the safe retry response if a cached response is malformed.
      }
    }
    return json(request, env, {
      success: true,
      replayed: true,
      submissionId: existing.id,
      message: "We received your interest. A Hope Sojourns team member will follow up with you.",
    });
  }
  return json(request, env, {
    error: "We already received this exact information. Your interests are safely on file.",
    code: "DUPLICATE_SUBMISSION",
    duplicate: true,
  }, 409);
}

async function activeOpportunities(env: Env, slugs: string[]): Promise<OpportunityRow[]> {
  const placeholders = slugs.map((_, index) => `?${index + 1}`).join(", ");
  const result = await env.DB.prepare(
    `SELECT id, slug, kind, title, location, partner, duration, sort_order
     FROM opportunities
     WHERE active = 1 AND slug IN (${placeholders})
     ORDER BY sort_order`,
  ).bind(...slugs).all<OpportunityRow>();
  return result.results;
}

async function listOpportunities(request: Request, env: Env): Promise<Response> {
  const result = await env.DB.prepare(
    "SELECT id, slug, kind, title, location, partner, duration, sort_order FROM opportunities WHERE active = 1 ORDER BY sort_order",
  ).all<OpportunityRow>();
  return json(request, env, { opportunities: result.results });
}

type RequestedTripRow = { id: string; opportunity_id: string | null; opportunity_slug: string | null; invite_id: string | null };

async function requestedTrip(env: Env, input: InterestSubmission): Promise<RequestedTripRow | null> {
  if (!input.tripId) return null;
  let trip: RequestedTripRow | null;
  if (input.inviteToken) {
    trip = await env.DB.prepare(
      `SELECT t.id, t.opportunity_id, o.slug AS opportunity_slug, i.id AS invite_id
       FROM trips t
       JOIN trip_invites i ON i.trip_id = t.id
       LEFT JOIN opportunities o ON o.id = t.opportunity_id
       WHERE t.id = ?1 AND i.token_hash = ?2 AND i.status = 'active'
         AND (i.expires_at IS NULL OR date(i.expires_at) >= date('now'))
         AND (i.max_uses IS NULL OR i.use_count < i.max_uses)`,
    ).bind(input.tripId, await base64UrlHash(input.inviteToken)).first<RequestedTripRow>();
  } else {
    trip = await env.DB.prepare(
      `SELECT t.id, t.opportunity_id, o.slug AS opportunity_slug, NULL AS invite_id
       FROM trips t LEFT JOIN opportunities o ON o.id = t.opportunity_id
       WHERE t.id = ?1 AND t.public_enabled = 1 AND t.interest_enabled = 1
         AND t.status NOT IN ('draft', 'archived', 'canceled')`,
    ).bind(input.tripId).first<RequestedTripRow>();
  }
  if (!trip) throw new HttpError(422, "TRIP_NOT_AVAILABLE", "That trip is not accepting interest right now.", {
    opportunities: "Choose another available trip or contact Hope Sojourns.",
  });
  if (trip.opportunity_slug && !input.opportunities.includes(trip.opportunity_slug)) {
    throw new HttpError(422, "TRIP_OPPORTUNITY_MISMATCH", "The trip selection did not match its public opportunity.", {
      opportunities: "Open the trip page again and retry the form.",
    });
  }
  return trip;
}

async function submitInterest(request: Request, env: Env): Promise<Response> {
  const raw = await readLimitedJson(request);
  if (isRecord(raw) && typeof raw.website === "string" && raw.website.trim()) {
    return json(request, env, { success: true, message: "Thank you. Your information was received." }, 202);
  }

  const input = validateSubmissionPayload(raw);
  const opportunities = await activeOpportunities(env, input.opportunities);
  if (opportunities.length !== input.opportunities.length) {
    throw new HttpError(422, "INVALID_OPPORTUNITY", "One of the selected opportunities is no longer available.", {
      opportunities: "Refresh the page and choose from the current opportunities.",
    });
  }

  const fingerprint = await requestFingerprint(input);
  const existing = await findExistingSubmission(env, input.idempotencyKey, fingerprint);
  if (existing) return existingSubmissionResult(request, env, existing, input.idempotencyKey, fingerprint);
  const actualTrip = await requestedTrip(env, input);

  const personId = crypto.randomUUID();
  const submissionId = crypto.randomUUID();
  const now = new Date().toISOString();
  const insertPerson = env.DB.prepare(
    `INSERT INTO people (
       id, first_name, last_name, first_name_normalized, last_name_normalized,
       email, email_normalized, phone, phone_normalized, contact_preference,
       field_of_study, created_at, updated_at
     ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13)
     ON CONFLICT (email_normalized, first_name_normalized, last_name_normalized)
     DO UPDATE SET
       first_name = excluded.first_name,
       last_name = excluded.last_name,
       email = excluded.email,
       phone = COALESCE(excluded.phone, people.phone),
       phone_normalized = COALESCE(excluded.phone_normalized, people.phone_normalized),
       contact_preference = excluded.contact_preference,
       field_of_study = COALESCE(excluded.field_of_study, people.field_of_study),
       updated_at = excluded.updated_at`,
  ).bind(
    personId, input.firstName, input.lastName, input.firstNameNormalized, input.lastNameNormalized,
    input.email, input.emailNormalized, input.phone, input.phoneNormalized, input.contactPreference,
    input.fieldOfStudy, now, now,
  );
  const insertSubmission = env.DB.prepare(
    `INSERT INTO interest_submissions (
       id, person_id, idempotency_key, request_fingerprint, selected_opportunities_json,
       preferred_timing, message, source_page, consent_at, created_at, updated_at
     )
     SELECT ?1, people.id, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10
     FROM people
     WHERE email_normalized = ?11 AND first_name_normalized = ?12 AND last_name_normalized = ?13`,
  ).bind(
    submissionId, input.idempotencyKey, fingerprint, JSON.stringify(input.opportunities),
    input.preferredTiming, input.message, sourcePage(request.headers.get("referer")), now, now, now,
    input.emailNormalized, input.firstNameNormalized, input.lastNameNormalized,
  );
  const interestStatements = opportunities.map(opportunity => env.DB.prepare(
    `INSERT OR IGNORE INTO interests (
       id, person_id, opportunity_id, submission_id, status, created_at, updated_at
     )
     SELECT ?1, people.id, opportunities.id, ?2, 'new', ?3, ?4
     FROM people
     JOIN opportunities ON opportunities.slug = ?5 AND opportunities.active = 1
     WHERE people.email_normalized = ?6
       AND people.first_name_normalized = ?7
       AND people.last_name_normalized = ?8`,
  ).bind(
    crypto.randomUUID(), submissionId, now, now, opportunity.slug,
    input.emailNormalized, input.firstNameNormalized, input.lastNameNormalized,
  ));
  const tagProspectiveTraveler = env.DB.prepare(
    `INSERT OR IGNORE INTO contact_types (person_id, contact_type, created_at)
     SELECT people.id, 'prospective_traveler', ?1 FROM people
     WHERE people.email_normalized = ?2
       AND people.first_name_normalized = ?3
       AND people.last_name_normalized = ?4`,
  ).bind(now, input.emailNormalized, input.firstNameNormalized, input.lastNameNormalized);
  const tripStatements: D1PreparedStatement[] = [];
  if (actualTrip) {
    tripStatements.push(
      env.DB.prepare(`INSERT INTO trip_interests (
        id, trip_id, person_id, submission_id, invite_id, status, created_at, updated_at
      ) SELECT ?1, ?2, people.id, ?3, ?4, 'interested', ?5, ?5 FROM people
        WHERE people.email_normalized = ?6 AND people.first_name_normalized = ?7 AND people.last_name_normalized = ?8
      ON CONFLICT (trip_id, person_id) DO UPDATE SET submission_id = excluded.submission_id,
        invite_id = COALESCE(excluded.invite_id, trip_interests.invite_id), updated_at = excluded.updated_at`).bind(
        crypto.randomUUID(), actualTrip.id, submissionId, actualTrip.invite_id, now,
        input.emailNormalized, input.firstNameNormalized, input.lastNameNormalized,
      ),
      env.DB.prepare(`INSERT OR IGNORE INTO trip_members (
        trip_id, person_id, role, status, directory_visible, directory_email_visible,
        directory_phone_visible, created_at, updated_at
      ) SELECT ?1, people.id, 'traveler', 'interested', 0, 0, 0, ?2, ?2 FROM people
        WHERE people.email_normalized = ?3 AND people.first_name_normalized = ?4 AND people.last_name_normalized = ?5`).bind(
        actualTrip.id, now, input.emailNormalized, input.firstNameNormalized, input.lastNameNormalized,
      ),
    );
    if (actualTrip.invite_id) {
      tripStatements.push(env.DB.prepare(
        "UPDATE trip_invites SET use_count = use_count + 1, updated_at = ?1 WHERE id = ?2",
      ).bind(now, actualTrip.invite_id));
    }
  }
  const insertAudit = env.DB.prepare(
    `INSERT INTO audit_events (id, entity_type, entity_id, event_type, metadata_json, created_at)
     VALUES (?1, 'interest_submission', ?2, 'created', ?3, ?4)`,
  ).bind(crypto.randomUUID(), submissionId, JSON.stringify({ opportunities: input.opportunities, tripId: actualTrip?.id ?? null }), now);

  let results: D1Result[];
  try {
    results = await env.DB.batch([insertPerson, insertSubmission, ...interestStatements, ...tripStatements, tagProspectiveTraveler, insertAudit]);
  } catch (error) {
    if (error instanceof Error && error.message.includes("UNIQUE constraint failed")) {
      const racedExisting = await findExistingSubmission(env, input.idempotencyKey, fingerprint);
      if (racedExisting) return existingSubmissionResult(request, env, racedExisting, input.idempotencyKey, fingerprint);
    }
    throw error;
  }

  const addedCount = results.slice(2, 2 + opportunities.length)
    .reduce((count, result) => count + Number(result.meta.changes ?? 0), 0);
  const alreadyInterestedCount = opportunities.length - addedCount;
  const responseBody = {
    success: true,
    submissionId,
    addedCount,
    alreadyInterestedCount,
    message: addedCount > 0
      ? `Thank you. We saved ${addedCount === 1 ? "your interest" : `your ${addedCount} interests`}. A Hope Sojourns team member will follow up with you.`
      : "These interests were already on file. A Hope Sojourns team member can help you update your plans.",
  };
  await env.DB.prepare("UPDATE interest_submissions SET result_json = ?1, updated_at = ?2 WHERE id = ?3")
    .bind(JSON.stringify(responseBody), now, submissionId)
    .run();

  console.log(JSON.stringify({ event: "interest_submission_saved", submissionId, addedCount, alreadyInterestedCount }));
  return json(request, env, responseBody, 201);
}

async function handleRequest(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  const path = routePath(url.pathname);
  const origin = request.headers.get("origin");

  if (request.method === "OPTIONS") {
    if (!isAllowedOrigin(origin, env.ALLOWED_ORIGINS)) return new Response(null, { status: 403 });
    return new Response(null, { status: 204, headers: corsHeaders(request, env) });
  }
  if (origin && !isAllowedOrigin(origin, env.ALLOWED_ORIGINS)) {
    throw new HttpError(403, "ORIGIN_NOT_ALLOWED", "This website is not allowed to use the form service.");
  }

  if (request.method === "GET" && (path === "/" || path === "/health")) {
    await env.DB.prepare("SELECT 1").first();
    return json(request, env, { status: "ok", service: "hope-sojourns-interest", environment: env.ENVIRONMENT });
  }
  if (path === "/internal/csm-distribution") return handleCsmDelivery(request, env);
  if (path.startsWith("/admin/trip-platform") || path.startsWith("/admin/trips")) {
    return handleTripAdminRequest(request, env, path);
  }
  if (path.startsWith("/admin/csm-inbox")) return handleCsmAdminRequest(request, env, path);
  if (path.startsWith("/admin/ledger") || path.startsWith("/admin/contacts/bulk-activity") || path.startsWith("/admin/contacts/documents")) {
    return handleLedgerAdminRequest(request, env, path);
  }
  if (path.startsWith("/admin/")) return handleAdminRequest(request, env, path);
  if (path.startsWith("/public/trips") || path.startsWith("/portal/") || path.startsWith("/private-account/")) {
    return handleTripPublicRequest(request, env, path);
  }
  if (request.method === "GET" && path === "/opportunities") return listOpportunities(request, env);
  if (request.method === "POST" && path === "/submissions") return submitInterest(request, env);
  throw new HttpError(404, "NOT_FOUND", "Not found.");
}

export default {
  async fetch(request, env): Promise<Response> {
    try {
      return await handleRequest(request, env);
    } catch (error) {
      if (error instanceof HttpError) {
        console.warn(JSON.stringify({ event: "request_rejected", status: error.status, code: error.code }));
        return json(request, env, {
          error: error.message,
          code: error.code,
          ...(error.fieldErrors ? { fieldErrors: error.fieldErrors } : {}),
        }, error.status);
      }
      console.error(JSON.stringify({ event: "unhandled_error", message: error instanceof Error ? error.message : "Unknown error" }));
      return json(request, env, { error: "The interest form encountered an unexpected error.", code: "SERVER_ERROR" }, 500);
    }
  },
} satisfies ExportedHandler<Env>;
