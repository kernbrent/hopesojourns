import {
  CONTACT_IMPORT_MAX_FILE_BYTES,
  ContactImportFileError,
  type ContactImportInput,
  type ContactImportOpportunity,
  normalizeImportEmail,
  normalizeImportName,
  normalizeImportPhone,
  parseContactImportFile,
  validateContactImportRow,
} from "./contact-import";

const ADMIN_BODY_LIMIT = 48 * 1024;
const CONTACT_IMPORT_REQUEST_LIMIT = CONTACT_IMPORT_MAX_FILE_BYTES + 128 * 1024;
const SESSION_HOURS = 8;
const REMEMBER_SESSION_DAYS = 30;
const LOGIN_WINDOW_MINUTES = 15;
const LOGIN_FAILURE_LIMIT = 5;
// Cloudflare Workers currently caps PBKDF2 at 100,000 iterations. Keep the
// stored work factor at that ceiling so password changes behave the same in
// local tests and in the deployed Worker.
const PASSWORD_HASH_ITERATIONS = 100_000;
const WORKERS_PBKDF2_MAX_ITERATIONS = 100_000;
const PASSWORD_SALT_BYTES = 16;
const ALLOWED_STATUSES = new Set(["new", "contacted", "exploring", "closed"]);
const CONTACT_TYPE_OPTIONS = [
  ["prospective_traveler", "Prospective Traveler"],
  ["traveler", "Traveler"],
  ["leader", "Leader"],
  ["donor", "Donor"],
  ["ministry_contact", "Ministry Contact"],
  ["staff", "Hope Sojourns Staff"],
  ["volunteer", "Volunteer"],
  ["other", "Other"],
] as const;
const CONTACT_AREA_OPTIONS = [
  ["mission", "Mission"],
  ["intern", "Intern"],
  ["corporate", "Corporate"],
] as const;
const ALLOWED_CONTACT_TYPES = new Set<string>(CONTACT_TYPE_OPTIONS.map(([value]) => value));
const ALLOWED_CONTACT_AREAS = new Set<string>(CONTACT_AREA_OPTIONS.map(([value]) => value));

export type AdminEnv = Env & {
  ADMIN_PASSWORD?: string;
  ADMIN_SESSION_SECRET?: string;
};

type AdminSessionRow = {
  id: string;
  csrf_token: string;
  expires_at: string;
};

type LoginAttemptRow = {
  failure_count: number;
  window_started_at: string;
  blocked_until: string | null;
};

type AdminCredentialRow = {
  algorithm: string;
  password_salt: string;
  password_hash: string;
  iterations: number;
};

type CloudflareSubtleCrypto = SubtleCrypto & {
  timingSafeEqual?(a: ArrayBuffer | ArrayBufferView, b: ArrayBuffer | ArrayBufferView): boolean;
};

type SubmissionListRow = {
  id: string;
  first_name: string;
  last_name: string;
  email: string;
  phone: string | null;
  contact_preference: string;
  field_of_study: string | null;
  preferred_timing: string | null;
  message: string | null;
  created_at: string;
  interests_json: string;
  reply_count: number;
  last_reply_at: string | null;
};

type PeopleListRow = {
  id: string;
  first_name: string;
  last_name: string;
  email: string;
  phone: string | null;
  contact_preference: string;
  field_of_study: string | null;
  organization: string | null;
  contact_status: string;
  record_source: string;
  created_at: string;
  updated_at: string;
  first_submission_at: string | null;
  last_submission_at: string | null;
  latest_activity_at: string;
  submission_count: number;
  reply_count: number;
  interests_json: string;
  teams_json: string;
  contact_types_json: string;
  languages_json: string;
  areas_json: string;
  trips_json: string;
};

type TeamListRow = {
  id: string;
  name: string;
  description: string | null;
  status: string;
  created_at: string;
  updated_at: string;
  member_count: number;
  latest_assignment_at: string | null;
};

type MinistryListRow = {
  id: string;
  name: string;
  description: string | null;
  city: string | null;
  region: string | null;
  country: string | null;
  email: string | null;
  phone: string | null;
  website: string | null;
  status: string;
  created_at: string;
  updated_at: string;
  contact_count: number;
  opportunity_count: number;
};

type PersonSubmissionRow = {
  id: string;
  preferred_timing: string | null;
  message: string | null;
  source_page: string | null;
  consent_at: string;
  created_at: string;
  interests_json: string;
};

type AdminFilters = {
  search: string;
  status: string;
  kind: string;
  opportunity: string;
  contactPreference: string;
  replyState: string;
  team: string;
  contactType: string;
  contactArea: string;
  dateFrom: string | null;
  dateToExclusive: string | null;
  sort: string;
};

type ImportPersonRow = {
  id: string;
  first_name: string;
  last_name: string;
  first_name_normalized: string;
  last_name_normalized: string;
  preferred_name: string | null;
  email: string;
  email_normalized: string;
  phone: string | null;
  phone_normalized: string | null;
  contact_preference: "email" | "phone";
  field_of_study: string | null;
  address_line_1: string | null;
  address_line_2: string | null;
  city: string | null;
  region: string | null;
  postal_code: string | null;
  country: string | null;
  organization: string | null;
  website: string | null;
  notes: string | null;
  contact_status: "active" | "inactive";
  last_contacted_at: string | null;
};

type ImportRowAnalysis = {
  rowNumber: number;
  name: string;
  email: string;
  phone: string | null;
  action: "create" | "update" | "error";
  existingPersonId: string | null;
  matchedBy: string | null;
  errors: string[];
  warnings: string[];
  input: ContactImportInput | null;
  existing: ImportPersonRow | null;
};

export class AdminError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly headers?: HeadersInit,
  ) {
    super(message);
  }
}

function securityHeaders(): Headers {
  return new Headers({
    "Cache-Control": "no-store, private",
    "Content-Security-Policy": "default-src 'none'; frame-ancestors 'none'",
    "Cross-Origin-Resource-Policy": "same-origin",
    "Referrer-Policy": "no-referrer",
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
  });
}

export function adminJson(body: unknown, status = 200, extraHeaders?: HeadersInit): Response {
  const headers = securityHeaders();
  headers.set("Content-Type", "application/json; charset=utf-8");
  if (extraHeaders) new Headers(extraHeaders).forEach((value, key) => headers.append(key, value));
  return Response.json(body, { status, headers });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export async function readAdminJson(request: Request): Promise<Record<string, unknown>> {
  if (request.headers.get("content-type")?.split(";", 1)[0].trim().toLowerCase() !== "application/json") {
    throw new AdminError(415, "UNSUPPORTED_MEDIA_TYPE", "Send this request as JSON.");
  }
  const contentLength = Number(request.headers.get("content-length") ?? 0);
  if (Number.isFinite(contentLength) && contentLength > ADMIN_BODY_LIMIT) {
    throw new AdminError(413, "REQUEST_TOO_LARGE", "This request is too large.");
  }
  const bytes = new Uint8Array(await request.arrayBuffer());
  if (bytes.byteLength > ADMIN_BODY_LIMIT) throw new AdminError(413, "REQUEST_TOO_LARGE", "This request is too large.");
  try {
    const value = JSON.parse(new TextDecoder().decode(bytes)) as unknown;
    if (!isRecord(value)) throw new Error("Expected an object");
    return value;
  } catch {
    throw new AdminError(400, "INVALID_JSON", "This request could not be read.");
  }
}

function cleanLine(value: unknown, maximum: number): string | null {
  if (typeof value !== "string") return null;
  const cleaned = value.normalize("NFKC").replace(/\s+/g, " ").trim();
  if (!cleaned || cleaned.length > maximum || /[\u0000-\u001F\u007F]/.test(cleaned)) return null;
  return cleaned;
}

function cleanMessage(value: unknown, maximum: number): string | null {
  if (typeof value !== "string") return null;
  const cleaned = value.normalize("NFKC").replace(/\r\n?/g, "\n").trim();
  if (!cleaned || cleaned.length > maximum || /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/.test(cleaned)) return null;
  return cleaned;
}

function cleanOptionalMessage(value: unknown, maximum: number): string | null {
  if (value === undefined || value === null || value === "") return null;
  return cleanMessage(value, maximum);
}

function cleanOptionalLine(value: unknown, maximum: number): string | null {
  if (value === undefined || value === null || value === "") return null;
  return cleanLine(value, maximum);
}

function normalizeTeamName(value: string): string {
  return value.normalize("NFKC").toLocaleLowerCase("en-US").replace(/\s+/g, " ").trim();
}

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function cleanEmail(value: unknown, required = false): string | null {
  const email = cleanOptionalLine(value, 254);
  if (!email) {
    if (required) throw new AdminError(422, "INVALID_CONTACT", "Enter a valid email address.");
    return null;
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new AdminError(422, "INVALID_CONTACT", "Enter a valid email address.");
  }
  return email;
}

function cleanPhone(value: unknown, required = false): string | null {
  const phone = cleanOptionalLine(value, 40);
  if (!phone) {
    if (required) throw new AdminError(422, "INVALID_CONTACT", "Enter a valid phone number.");
    return null;
  }
  const digits = phone.replace(/\D/g, "");
  if (digits.length < 7 || digits.length > 18) {
    throw new AdminError(422, "INVALID_CONTACT", "Enter a phone number with 7 to 18 digits.");
  }
  return phone;
}

function cleanWebsite(value: unknown): string | null {
  const website = cleanOptionalLine(value, 300);
  if (!website) return null;
  try {
    const url = new URL(website);
    if (url.protocol !== "http:" && url.protocol !== "https:") throw new Error("Unsupported protocol");
    return url.toString();
  } catch {
    throw new AdminError(422, "INVALID_CONTACT", "Enter a complete website address beginning with http:// or https://.");
  }
}

function cleanChoiceArray(value: unknown, allowed: Set<string>, maximum: number, message: string): string[] {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value) || value.length > maximum || value.some(item => typeof item !== "string" || !allowed.has(item))) {
    throw new AdminError(422, "INVALID_SELECTION", message);
  }
  return [...new Set(value as string[])];
}

function cleanLanguages(value: unknown): string[] {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value) || value.length > 20) {
    throw new AdminError(422, "INVALID_LANGUAGES", "Add no more than 20 languages.");
  }
  const languages = value.map(item => cleanLine(item, 60));
  if (languages.some(item => !item)) {
    throw new AdminError(422, "INVALID_LANGUAGES", "Use 60 characters or fewer for each language.");
  }
  const unique = new Map<string, string>();
  for (const language of languages as string[]) unique.set(normalizeTeamName(language), language);
  return [...unique.values()];
}

function cleanTripIds(value: unknown): string[] {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value) || value.length > 100 || value.some(item => typeof item !== "string" || !/^[a-z0-9-]{3,80}$/.test(item))) {
    throw new AdminError(422, "INVALID_TRIPS", "Choose valid trips for this contact.");
  }
  return [...new Set(value as string[])];
}

function cleanOptionalDate(value: unknown): string | null {
  if (value === undefined || value === null || value === "") return null;
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new AdminError(422, "INVALID_DATE", "Choose a valid last-contacted date.");
  }
  const date = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value) {
    throw new AdminError(422, "INVALID_DATE", "Choose a valid last-contacted date.");
  }
  return date.toISOString();
}

type ContactInput = {
  firstName: string;
  lastName: string;
  preferredName: string | null;
  email: string;
  phone: string | null;
  contactPreference: "email" | "phone";
  fieldOfStudy: string | null;
  addressLine1: string | null;
  addressLine2: string | null;
  city: string | null;
  region: string | null;
  postalCode: string | null;
  country: string | null;
  organization: string | null;
  website: string | null;
  notes: string | null;
  contactStatus: "active" | "inactive";
  lastContactedAt: string | null;
  contactTypes: string[];
  areas: string[];
  languages: string[];
  tripIds: string[];
};

type MinistryInput = {
  name: string;
  description: string | null;
  addressLine1: string | null;
  addressLine2: string | null;
  city: string | null;
  region: string | null;
  postalCode: string | null;
  country: string | null;
  email: string | null;
  phone: string | null;
  website: string | null;
  notes: string | null;
  status: "active" | "inactive";
  tripIds: string[];
};

function contactInput(body: Record<string, unknown>): ContactInput {
  const firstName = cleanLine(body.firstName, 80);
  const lastName = cleanLine(body.lastName, 80);
  if (!firstName || !lastName) throw new AdminError(422, "INVALID_CONTACT", "Enter the contact’s first and last name.");
  const email = cleanEmail(body.email) ?? "";
  const phone = cleanPhone(body.phone);
  if (!email && !phone) throw new AdminError(422, "INVALID_CONTACT", "Enter at least an email address or phone number.");
  const requestedPreference = body.contactPreference === "phone" ? "phone" : "email";
  const contactPreference = requestedPreference === "phone" && !phone ? "email" : requestedPreference === "email" && !email ? "phone" : requestedPreference;
  const contactStatus = body.contactStatus === "inactive" ? "inactive" : "active";
  const contactTypes = cleanChoiceArray(body.contactTypes, ALLOWED_CONTACT_TYPES, 8, "Choose valid contact types.");
  return {
    firstName,
    lastName,
    preferredName: cleanOptionalLine(body.preferredName, 80),
    email,
    phone,
    contactPreference,
    fieldOfStudy: cleanOptionalLine(body.fieldOfStudy, 160),
    addressLine1: cleanOptionalLine(body.addressLine1, 160),
    addressLine2: cleanOptionalLine(body.addressLine2, 160),
    city: cleanOptionalLine(body.city, 100),
    region: cleanOptionalLine(body.region, 100),
    postalCode: cleanOptionalLine(body.postalCode, 30),
    country: cleanOptionalLine(body.country, 100),
    organization: cleanOptionalLine(body.organization, 160),
    website: cleanWebsite(body.website),
    notes: cleanOptionalMessage(body.notes, 5000),
    contactStatus,
    lastContactedAt: cleanOptionalDate(body.lastContactedAt),
    contactTypes: contactTypes.length ? contactTypes : ["other"],
    areas: cleanChoiceArray(body.areas, ALLOWED_CONTACT_AREAS, 3, "Choose valid Hope Sojourns areas."),
    languages: cleanLanguages(body.languages),
    tripIds: cleanTripIds(body.tripIds),
  };
}

function ministryInput(body: Record<string, unknown>): MinistryInput {
  const name = cleanLine(body.name, 160);
  if (!name) throw new AdminError(422, "INVALID_MINISTRY", "Enter a ministry name using 160 characters or fewer.");
  return {
    name,
    description: cleanOptionalMessage(body.description, 2000),
    addressLine1: cleanOptionalLine(body.addressLine1, 160),
    addressLine2: cleanOptionalLine(body.addressLine2, 160),
    city: cleanOptionalLine(body.city, 100),
    region: cleanOptionalLine(body.region, 100),
    postalCode: cleanOptionalLine(body.postalCode, 30),
    country: cleanOptionalLine(body.country, 100),
    email: cleanEmail(body.email),
    phone: cleanPhone(body.phone),
    website: cleanWebsite(body.website),
    notes: cleanOptionalMessage(body.notes, 5000),
    status: body.status === "inactive" ? "inactive" : "active",
    tripIds: cleanTripIds(body.tripIds),
  };
}

function base64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function randomToken(length = 32): string {
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  return base64Url(bytes);
}

async function hashText(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, "0")).join("");
}

export async function secureEqual(left: string, right: string): Promise<boolean> {
  const encoder = new TextEncoder();
  const [leftHash, rightHash] = await Promise.all([
    crypto.subtle.digest("SHA-256", encoder.encode(left)),
    crypto.subtle.digest("SHA-256", encoder.encode(right)),
  ]);
  const subtle = crypto.subtle as CloudflareSubtleCrypto;
  if (subtle.timingSafeEqual) return subtle.timingSafeEqual(leftHash, rightHash);
  const leftBytes = new Uint8Array(leftHash);
  const rightBytes = new Uint8Array(rightHash);
  let difference = 0;
  for (let index = 0; index < leftBytes.length; index += 1) difference |= leftBytes[index] ^ rightBytes[index];
  return difference === 0;
}

function requireSessionSecret(env: AdminEnv): string {
  if (!env.ADMIN_SESSION_SECRET) {
    throw new AdminError(503, "ADMIN_NOT_CONFIGURED", "The Admin Portal is not configured yet.");
  }
  return env.ADMIN_SESSION_SECRET;
}

function base64UrlBytes(value: string): Uint8Array<ArrayBuffer> | null {
  if (!/^[A-Za-z0-9_-]{20,100}$/.test(value)) return null;
  const base64 = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = base64.padEnd(Math.ceil(base64.length / 4) * 4, "=");
  try {
    const binary = atob(padded);
    return Uint8Array.from(binary, character => character.charCodeAt(0));
  } catch {
    return null;
  }
}

export async function deriveAdminPasswordHash(
  password: string,
  salt: Uint8Array<ArrayBuffer>,
  iterations = PASSWORD_HASH_ITERATIONS,
): Promise<string> {
  if (!Number.isInteger(iterations) || iterations < 1 || iterations > WORKERS_PBKDF2_MAX_ITERATIONS) {
    throw new Error(`PBKDF2 iterations must be between 1 and ${WORKERS_PBKDF2_MAX_ITERATIONS}.`);
  }
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(password),
    "PBKDF2",
    false,
    ["deriveBits"],
  );
  const bits = await crypto.subtle.deriveBits({
    name: "PBKDF2",
    hash: "SHA-256",
    salt,
    iterations,
  }, key, 256);
  return base64Url(new Uint8Array(bits));
}

export function adminPasswordPolicyError(password: unknown): string | null {
  if (typeof password !== "string" || password.length < 12) {
    return "Use at least 12 characters for the new password.";
  }
  if (password.length > 128) return "Use no more than 128 characters for the new password.";
  if (/[\u0000-\u001F\u007F]/.test(password)) return "The new password cannot contain control characters.";
  const categories = [
    /\p{Lu}/u.test(password),
    /\p{Ll}/u.test(password),
    /\p{N}/u.test(password),
    /[^\p{L}\p{N}\s]/u.test(password),
  ].filter(Boolean).length;
  if (categories < 3) {
    return "Use at least three of these: uppercase letters, lowercase letters, numbers, and symbols.";
  }
  return null;
}

async function storedAdminCredential(env: AdminEnv): Promise<AdminCredentialRow | null> {
  return env.DB.prepare(
    "SELECT algorithm, password_salt, password_hash, iterations FROM admin_credentials WHERE id = 'primary' LIMIT 1",
  ).first<AdminCredentialRow>();
}

async function verifyAdminPassword(env: AdminEnv, password: string): Promise<boolean> {
  const credential = await storedAdminCredential(env);
  if (!credential) {
    if (!env.ADMIN_PASSWORD) {
      throw new AdminError(503, "ADMIN_NOT_CONFIGURED", "The Admin Portal is not configured yet.");
    }
    return secureEqual(password, env.ADMIN_PASSWORD);
  }
  const salt = base64UrlBytes(credential.password_salt);
  if (
    credential.algorithm !== "PBKDF2-SHA256"
    || !salt
    || salt.byteLength !== PASSWORD_SALT_BYTES
    || credential.iterations < 100_000
    || credential.iterations > WORKERS_PBKDF2_MAX_ITERATIONS
    || !/^[A-Za-z0-9_-]{40,60}$/.test(credential.password_hash)
  ) {
    console.error(JSON.stringify({ event: "admin_credential_invalid" }));
    throw new AdminError(503, "ADMIN_NOT_CONFIGURED", "The Admin Portal is not configured yet.");
  }
  const derived = await deriveAdminPasswordHash(password, salt, credential.iterations);
  return secureEqual(derived, credential.password_hash);
}

function cookieValue(request: Request, name: string): string | null {
  const cookie = request.headers.get("cookie");
  if (!cookie) return null;
  for (const item of cookie.split(";")) {
    const separator = item.indexOf("=");
    if (separator < 0) continue;
    if (item.slice(0, separator).trim() === name) return item.slice(separator + 1).trim();
  }
  return null;
}

function sessionCookie(token: string, maxAgeSeconds: number | null): string {
  const persistence = maxAgeSeconds === null ? "" : `; Max-Age=${maxAgeSeconds}`;
  return `hs_admin_session=${token}; Path=/api/interest/admin${persistence}; HttpOnly; Secure; SameSite=Strict`;
}

export async function authenticate(request: Request, env: AdminEnv, requireCsrf = false): Promise<AdminSessionRow> {
  const token = cookieValue(request, "hs_admin_session");
  if (!token || !/^[A-Za-z0-9_-]{40,100}$/.test(token)) {
    throw new AdminError(401, "AUTH_REQUIRED", "Sign in to continue.");
  }
  const tokenHash = await hashText(token);
  const session = await env.DB.prepare(
    "SELECT id, csrf_token, expires_at FROM admin_sessions WHERE token_hash = ?1 LIMIT 1",
  ).bind(tokenHash).first<AdminSessionRow>();
  if (!session || Date.parse(session.expires_at) <= Date.now()) {
    if (session) await env.DB.prepare("DELETE FROM admin_sessions WHERE id = ?1").bind(session.id).run();
    throw new AdminError(401, "SESSION_EXPIRED", "Your session expired. Sign in again.", {
      "Set-Cookie": sessionCookie("", 0),
    });
  }
  if (requireCsrf) {
    const csrf = request.headers.get("x-csrf-token") ?? "";
    if (!csrf || !(await secureEqual(csrf, session.csrf_token))) {
      throw new AdminError(403, "CSRF_REJECTED", "Refresh the Admin Portal and try again.");
    }
  }
  await env.DB.prepare("UPDATE admin_sessions SET last_seen_at = ?1 WHERE id = ?2")
    .bind(new Date().toISOString(), session.id)
    .run();
  return session;
}

export function auditStatement(env: AdminEnv, entityType: string, entityId: string, eventType: string, metadata?: unknown): D1PreparedStatement {
  return env.DB.prepare(
    `INSERT INTO audit_events (id, entity_type, entity_id, event_type, metadata_json, created_at)
     VALUES (?1, ?2, ?3, ?4, ?5, ?6)`,
  ).bind(
    crypto.randomUUID(), entityType, entityId, eventType,
    metadata === undefined ? null : JSON.stringify(metadata), new Date().toISOString(),
  );
}

async function audit(env: AdminEnv, entityType: string, entityId: string, eventType: string, metadata?: unknown): Promise<void> {
  await auditStatement(env, entityType, entityId, eventType, metadata).run();
}

async function loginKey(request: Request, sessionSecret: string): Promise<string> {
  const address = request.headers.get("cf-connecting-ip") ?? "unknown";
  return hashText(`${sessionSecret}:login:${address}`);
}

async function checkLoginBlock(env: AdminEnv, keyHash: string): Promise<LoginAttemptRow | null> {
  const attempt = await env.DB.prepare(
    "SELECT failure_count, window_started_at, blocked_until FROM admin_login_attempts WHERE key_hash = ?1",
  ).bind(keyHash).first<LoginAttemptRow>();
  if (attempt?.blocked_until && Date.parse(attempt.blocked_until) > Date.now()) {
    const retryAfter = Math.max(1, Math.ceil((Date.parse(attempt.blocked_until) - Date.now()) / 1000));
    throw new AdminError(429, "LOGIN_RATE_LIMITED", "Too many sign-in attempts. Wait a few minutes and try again.", {
      "Retry-After": String(retryAfter),
    });
  }
  return attempt;
}

async function recordLoginFailure(env: AdminEnv, keyHash: string, current: LoginAttemptRow | null): Promise<void> {
  const now = new Date();
  const currentWindow = current && Date.parse(current.window_started_at) > now.getTime() - LOGIN_WINDOW_MINUTES * 60_000;
  const failureCount = currentWindow ? current.failure_count + 1 : 1;
  const windowStartedAt = currentWindow ? current.window_started_at : now.toISOString();
  const blockedUntil = failureCount >= LOGIN_FAILURE_LIMIT
    ? new Date(now.getTime() + LOGIN_WINDOW_MINUTES * 60_000).toISOString()
    : null;
  await env.DB.prepare(
    `INSERT INTO admin_login_attempts (key_hash, failure_count, window_started_at, blocked_until, updated_at)
     VALUES (?1, ?2, ?3, ?4, ?5)
     ON CONFLICT (key_hash) DO UPDATE SET
       failure_count = excluded.failure_count,
       window_started_at = excluded.window_started_at,
       blocked_until = excluded.blocked_until,
       updated_at = excluded.updated_at`,
  ).bind(keyHash, failureCount, windowStartedAt, blockedUntil, now.toISOString()).run();
  if (blockedUntil) {
    throw new AdminError(429, "LOGIN_RATE_LIMITED", "Too many sign-in attempts. Wait a few minutes and try again.", {
      "Retry-After": String(LOGIN_WINDOW_MINUTES * 60),
    });
  }
}

async function login(request: Request, env: AdminEnv): Promise<Response> {
  const sessionSecret = requireSessionSecret(env);
  const body = await readAdminJson(request);
  const submittedPassword = typeof body.password === "string" ? body.password : "";
  const rememberMe = body.rememberMe === true;
  const keyHash = await loginKey(request, sessionSecret);
  const currentAttempt = await checkLoginBlock(env, keyHash);
  if (!submittedPassword || submittedPassword.length > 256 || !(await verifyAdminPassword(env, submittedPassword))) {
    await recordLoginFailure(env, keyHash, currentAttempt);
    console.warn(JSON.stringify({ event: "admin_login_failed" }));
    throw new AdminError(401, "INVALID_CREDENTIALS", "The password is incorrect.");
  }

  const now = new Date();
  const sessionLifetimeSeconds = rememberMe
    ? REMEMBER_SESSION_DAYS * 24 * 60 * 60
    : SESSION_HOURS * 60 * 60;
  const expiresAt = new Date(now.getTime() + sessionLifetimeSeconds * 1000);
  const token = randomToken();
  const csrfToken = randomToken(24);
  const userAgent = request.headers.get("user-agent") ?? "";
  const userAgentHash = userAgent ? await hashText(`${sessionSecret}:ua:${userAgent}`) : null;
  await env.DB.batch([
    env.DB.prepare("DELETE FROM admin_login_attempts WHERE key_hash = ?1").bind(keyHash),
    env.DB.prepare("DELETE FROM admin_sessions WHERE expires_at <= ?1").bind(now.toISOString()),
    env.DB.prepare(
      `INSERT INTO admin_sessions (id, token_hash, csrf_token, created_at, expires_at, last_seen_at, user_agent_hash)
       VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)`,
    ).bind(
      crypto.randomUUID(), await hashText(token), csrfToken, now.toISOString(), expiresAt.toISOString(), now.toISOString(), userAgentHash,
    ),
  ]);
  await audit(env, "admin_session", "portal", "login", { remembered: rememberMe });
  console.log(JSON.stringify({ event: "admin_login_succeeded" }));
  return adminJson({
    authenticated: true,
    csrfToken,
    expiresAt: expiresAt.toISOString(),
    replyDelivery: "email_client",
  }, 200, { "Set-Cookie": sessionCookie(token, rememberMe ? sessionLifetimeSeconds : null) });
}

async function sessionInfo(request: Request, env: AdminEnv): Promise<Response> {
  requireSessionSecret(env);
  const session = await authenticate(request, env);
  return adminJson({
    authenticated: true,
    csrfToken: session.csrf_token,
    expiresAt: session.expires_at,
    replyDelivery: "email_client",
  });
}

async function logout(request: Request, env: AdminEnv): Promise<Response> {
  const session = await authenticate(request, env, true);
  await env.DB.prepare("DELETE FROM admin_sessions WHERE id = ?1").bind(session.id).run();
  await audit(env, "admin_session", session.id, "logout");
  return adminJson({ success: true }, 200, { "Set-Cookie": sessionCookie("", 0) });
}

async function changePassword(request: Request, env: AdminEnv): Promise<Response> {
  const session = await authenticate(request, env, true);
  const body = await readAdminJson(request);
  const currentPassword = typeof body.currentPassword === "string" ? body.currentPassword : "";
  const newPassword = typeof body.newPassword === "string" ? body.newPassword : "";
  const confirmPassword = typeof body.confirmPassword === "string" ? body.confirmPassword : "";
  if (!currentPassword || currentPassword.length > 256 || !(await verifyAdminPassword(env, currentPassword))) {
    throw new AdminError(422, "INVALID_CURRENT_PASSWORD", "The current password is incorrect.");
  }
  const policyError = adminPasswordPolicyError(newPassword);
  if (policyError) throw new AdminError(422, "INVALID_NEW_PASSWORD", policyError);
  if (!(await secureEqual(newPassword, confirmPassword))) {
    throw new AdminError(422, "PASSWORDS_DO_NOT_MATCH", "The new passwords do not match.");
  }
  if (await secureEqual(currentPassword, newPassword)) {
    throw new AdminError(422, "PASSWORD_UNCHANGED", "Choose a new password that is different from the current password.");
  }

  const salt = new Uint8Array(PASSWORD_SALT_BYTES);
  crypto.getRandomValues(salt);
  const passwordHash = await deriveAdminPasswordHash(newPassword, salt);
  const now = new Date().toISOString();
  await env.DB.batch([
    env.DB.prepare(
      `INSERT INTO admin_credentials (id, algorithm, password_salt, password_hash, iterations, created_at, updated_at)
       VALUES ('primary', 'PBKDF2-SHA256', ?1, ?2, ?3, ?4, ?5)
       ON CONFLICT (id) DO UPDATE SET
         algorithm = excluded.algorithm,
         password_salt = excluded.password_salt,
         password_hash = excluded.password_hash,
         iterations = excluded.iterations,
         updated_at = excluded.updated_at`,
    ).bind(base64Url(salt), passwordHash, PASSWORD_HASH_ITERATIONS, now, now),
    env.DB.prepare("DELETE FROM admin_sessions WHERE id <> ?1").bind(session.id),
    auditStatement(env, "admin_credential", "primary", "password_changed"),
  ]);
  console.log(JSON.stringify({ event: "admin_password_changed" }));
  return adminJson({ success: true, otherSessionsEnded: true });
}

function parseJsonArray(value: string): unknown[] {
  try {
    const parsed = JSON.parse(value) as unknown;
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, match => `\\${match}`);
}

function positiveInteger(value: string | null, fallback: number, maximum: number): number {
  const parsed = Number.parseInt(value ?? "", 10);
  return Number.isFinite(parsed) && parsed > 0 ? Math.min(parsed, maximum) : fallback;
}

export function dateFilterBound(value: string | null, exclusiveEnd = false): string | null {
  if (!value) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new AdminError(400, "INVALID_FILTER", "Choose a valid date filter.");
  const date = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value) {
    throw new AdminError(400, "INVALID_FILTER", "Choose a valid date filter.");
  }
  if (exclusiveEnd) date.setUTCDate(date.getUTCDate() + 1);
  return date.toISOString();
}

function adminFilters(url: URL): AdminFilters {
  const status = url.searchParams.get("status") ?? "";
  const kind = url.searchParams.get("kind") ?? "";
  const opportunity = url.searchParams.get("opportunity") ?? "";
  const contactPreference = url.searchParams.get("contactPreference") ?? "";
  const replyState = url.searchParams.get("replyState") ?? "";
  const team = url.searchParams.get("team") ?? "";
  const contactType = url.searchParams.get("contactType") ?? "";
  const contactArea = url.searchParams.get("contactArea") ?? "";
  const sort = url.searchParams.get("sort") ?? "newest";
  if (status && !ALLOWED_STATUSES.has(status)) throw new AdminError(400, "INVALID_FILTER", "Choose a valid status filter.");
  if (kind && kind !== "trip" && kind !== "internship") throw new AdminError(400, "INVALID_FILTER", "Choose a valid opportunity type.");
  if (opportunity && !/^[a-z0-9-]{3,80}$/.test(opportunity)) throw new AdminError(400, "INVALID_FILTER", "Choose a valid opportunity.");
  if (contactPreference && contactPreference !== "email" && contactPreference !== "phone") {
    throw new AdminError(400, "INVALID_FILTER", "Choose a valid contact preference.");
  }
  if (replyState && !["unreplied", "draft", "sent"].includes(replyState)) {
    throw new AdminError(400, "INVALID_FILTER", "Choose a valid reply state.");
  }
  if (team && team !== "unassigned" && !isUuid(team)) {
    throw new AdminError(400, "INVALID_FILTER", "Choose a valid team.");
  }
  if (contactType && !ALLOWED_CONTACT_TYPES.has(contactType)) {
    throw new AdminError(400, "INVALID_FILTER", "Choose a valid contact type.");
  }
  if (contactArea && !ALLOWED_CONTACT_AREAS.has(contactArea)) {
    throw new AdminError(400, "INVALID_FILTER", "Choose a valid Hope Sojourns area.");
  }
  if (!["newest", "oldest", "name_asc", "name_desc"].includes(sort)) {
    throw new AdminError(400, "INVALID_FILTER", "Choose a valid sort order.");
  }
  const dateFrom = dateFilterBound(url.searchParams.get("dateFrom"));
  const dateToExclusive = dateFilterBound(url.searchParams.get("dateTo"), true);
  if (dateFrom && dateToExclusive && dateFrom >= dateToExclusive) {
    throw new AdminError(400, "INVALID_FILTER", "The start date must be on or before the end date.");
  }
  return {
    search: (url.searchParams.get("search") ?? "").normalize("NFKC").trim().slice(0, 100),
    status,
    kind,
    opportunity,
    contactPreference,
    replyState,
    team,
    contactType,
    contactArea,
    dateFrom,
    dateToExclusive,
    sort,
  };
}

function filterSql(filters: AdminFilters, scope: "person" | "submission"): { whereSql: string; bindings: unknown[] } {
  const where: string[] = [];
  const bindings: unknown[] = [];
  if (filters.search) {
    const like = `%${escapeLike(filters.search)}%`;
    where.push(`(
      p.first_name LIKE ? ESCAPE '\\' OR p.last_name LIKE ? ESCAPE '\\' OR
      (p.first_name || ' ' || p.last_name) LIKE ? ESCAPE '\\' OR
      p.email LIKE ? ESCAPE '\\' OR COALESCE(p.phone, '') LIKE ? ESCAPE '\\' OR
      COALESCE(p.field_of_study, '') LIKE ? ESCAPE '\\' OR
      COALESCE(p.organization, '') LIKE ? ESCAPE '\\' OR COALESCE(p.city, '') LIKE ? ESCAPE '\\' OR
      COALESCE(p.region, '') LIKE ? ESCAPE '\\' OR COALESCE(p.country, '') LIKE ? ESCAPE '\\' OR
      EXISTS (SELECT 1 FROM contact_languages searched_language
              WHERE searched_language.person_id = p.id AND searched_language.language LIKE ? ESCAPE '\\')
    )`);
    bindings.push(like, like, like, like, like, like, like, like, like, like, like);
  }
  if (filters.status || filters.kind || filters.opportunity) {
    const interestWhere = scope === "submission" ? [] : ["filtered_interest.person_id = p.id"];
    if (filters.status) {
      interestWhere.push("filtered_interest.status = ?");
      bindings.push(filters.status);
    }
    if (filters.kind) {
      interestWhere.push("filtered_opportunity.kind = ?");
      bindings.push(filters.kind);
    }
    if (filters.opportunity) {
      interestWhere.push("filtered_opportunity.slug = ?");
      bindings.push(filters.opportunity);
    }
    where.push(scope === "submission"
      ? `EXISTS (
          SELECT 1 FROM json_each(s.selected_opportunities_json) filtered_selected
          JOIN opportunities filtered_opportunity ON filtered_opportunity.slug = filtered_selected.value
          JOIN interests filtered_interest
            ON filtered_interest.person_id = p.id AND filtered_interest.opportunity_id = filtered_opportunity.id
          ${interestWhere.length ? `WHERE ${interestWhere.join(" AND ")}` : ""}
        )`
      : `EXISTS (
          SELECT 1 FROM interests filtered_interest
          JOIN opportunities filtered_opportunity ON filtered_opportunity.id = filtered_interest.opportunity_id
          WHERE ${interestWhere.join(" AND ")}
        )`);
  }
  if (filters.contactPreference) {
    where.push("p.contact_preference = ?");
    bindings.push(filters.contactPreference);
  }
  if (filters.dateFrom || filters.dateToExclusive) {
    if (scope === "submission") {
      if (filters.dateFrom) {
        where.push("s.created_at >= ?");
        bindings.push(filters.dateFrom);
      }
      if (filters.dateToExclusive) {
        where.push("s.created_at < ?");
        bindings.push(filters.dateToExclusive);
      }
    } else {
      const dateWhere = ["filtered_date.person_id = p.id"];
      if (filters.dateFrom) {
        dateWhere.push("filtered_date.created_at >= ?");
        bindings.push(filters.dateFrom);
      }
      if (filters.dateToExclusive) {
        dateWhere.push("filtered_date.created_at < ?");
        bindings.push(filters.dateToExclusive);
      }
      where.push(`EXISTS (SELECT 1 FROM interest_submissions filtered_date WHERE ${dateWhere.join(" AND ")})`);
    }
  }
  if (filters.replyState === "unreplied") {
    where.push(scope === "submission"
      ? "NOT EXISTS (SELECT 1 FROM submission_replies filtered_reply WHERE filtered_reply.submission_id = s.id)"
      : `NOT EXISTS (
          SELECT 1 FROM submission_replies filtered_reply
          JOIN interest_submissions filtered_reply_submission ON filtered_reply_submission.id = filtered_reply.submission_id
          WHERE filtered_reply_submission.person_id = p.id
        )`);
  } else if (filters.replyState) {
    where.push(scope === "submission"
      ? "EXISTS (SELECT 1 FROM submission_replies filtered_reply WHERE filtered_reply.submission_id = s.id AND filtered_reply.delivery_status = ?)"
      : `EXISTS (
          SELECT 1 FROM submission_replies filtered_reply
          JOIN interest_submissions filtered_reply_submission ON filtered_reply_submission.id = filtered_reply.submission_id
          WHERE filtered_reply_submission.person_id = p.id AND filtered_reply.delivery_status = ?
        )`);
    bindings.push(filters.replyState);
  }
  if (filters.team === "unassigned") {
    where.push("NOT EXISTS (SELECT 1 FROM team_members filtered_team_member WHERE filtered_team_member.person_id = p.id)");
  } else if (filters.team) {
    where.push("EXISTS (SELECT 1 FROM team_members filtered_team_member WHERE filtered_team_member.person_id = p.id AND filtered_team_member.team_id = ?)");
    bindings.push(filters.team);
  }
  if (filters.contactType) {
    where.push("EXISTS (SELECT 1 FROM contact_types filtered_contact_type WHERE filtered_contact_type.person_id = p.id AND filtered_contact_type.contact_type = ?)");
    bindings.push(filters.contactType);
  }
  if (filters.contactArea) {
    where.push("EXISTS (SELECT 1 FROM contact_areas filtered_contact_area WHERE filtered_contact_area.person_id = p.id AND filtered_contact_area.area = ?)");
    bindings.push(filters.contactArea);
  }
  return { whereSql: where.length ? `WHERE ${where.join(" AND ")}` : "", bindings };
}

async function adminSummary(env: AdminEnv): Promise<Record<string, number>> {
  return await env.DB.prepare(
    `SELECT
       (SELECT COUNT(*) FROM interest_submissions) AS submissions,
       (SELECT COUNT(*) FROM people) AS people,
       (SELECT COUNT(*) FROM interests) AS interests,
       (SELECT COUNT(*) FROM interests WHERE status = 'new') AS new_interests,
       (SELECT COUNT(*) FROM submission_replies WHERE delivery_status = 'sent') AS sent_replies,
       (SELECT COUNT(*) FROM ministries) AS ministries`,
  ).first<Record<string, number>>() ?? { submissions: 0, people: 0, interests: 0, new_interests: 0, sent_replies: 0, ministries: 0 };
}

async function adminFilterOptions(env: AdminEnv): Promise<Record<string, unknown>> {
  const [opportunities, dates, teams] = await Promise.all([
    env.DB.prepare(
      "SELECT id, slug, kind, title, location FROM opportunities WHERE active = 1 ORDER BY CASE kind WHEN 'trip' THEN 0 ELSE 1 END, sort_order",
    ).all<Record<string, string>>(),
    env.DB.prepare(
      "SELECT MIN(created_at) AS earliest, MAX(created_at) AS latest FROM interest_submissions",
    ).first<Record<string, string | null>>(),
    env.DB.prepare(
      "SELECT id, name, status FROM teams WHERE status = 'active' ORDER BY name_normalized",
    ).all<Record<string, string>>(),
  ]);
  return {
    opportunities: opportunities.results,
    teams: teams.results,
    contactTypes: CONTACT_TYPE_OPTIONS.map(([value, label]) => ({ value, label })),
    contactAreas: CONTACT_AREA_OPTIONS.map(([value, label]) => ({ value, label })),
    earliestDate: dates?.earliest ?? null,
    latestDate: dates?.latest ?? null,
  };
}

async function listSubmissions(request: Request, env: AdminEnv): Promise<Response> {
  await authenticate(request, env);
  const url = new URL(request.url);
  const filters = adminFilters(url);
  const page = positiveInteger(url.searchParams.get("page"), 1, 10_000);
  const pageSize = positiveInteger(url.searchParams.get("pageSize"), 25, 50);
  const { whereSql, bindings } = filterSql(filters, "submission");
  const orderOptions: Record<string, string> = {
    newest: "s.created_at DESC",
    oldest: "s.created_at ASC",
    name_asc: "p.last_name COLLATE NOCASE ASC, p.first_name COLLATE NOCASE ASC, s.created_at DESC",
    name_desc: "p.last_name COLLATE NOCASE DESC, p.first_name COLLATE NOCASE DESC, s.created_at DESC",
  };
  const orderBy = orderOptions[filters.sort] ?? orderOptions.newest;
  const countRow = await env.DB.prepare(
    `SELECT COUNT(*) AS total FROM interest_submissions s JOIN people p ON p.id = s.person_id ${whereSql}`,
  ).bind(...bindings).first<{ total: number }>();
  const result = await env.DB.prepare(
    `SELECT
       s.id, p.first_name, p.last_name, p.email, p.phone, p.contact_preference, p.field_of_study,
       s.preferred_timing, s.message, s.created_at,
       COALESCE((
         SELECT json_group_array(json_object(
           'id', selected.interest_id,
           'slug', selected.slug,
           'title', selected.title,
           'kind', selected.kind,
           'location', selected.location,
           'partner', selected.partner,
           'duration', selected.duration,
           'status', selected.status
         ))
         FROM (
           SELECT i.id AS interest_id, o.slug, o.title, o.kind, o.location, o.partner, o.duration,
                  COALESCE(i.status, 'new') AS status
           FROM json_each(s.selected_opportunities_json) requested
           JOIN opportunities o ON o.slug = requested.value
           LEFT JOIN interests i ON i.person_id = s.person_id AND i.opportunity_id = o.id
           ORDER BY o.sort_order
         ) selected
       ), '[]') AS interests_json,
       (SELECT COUNT(*) FROM submission_replies r WHERE r.submission_id = s.id) AS reply_count,
       (SELECT MAX(r.created_at) FROM submission_replies r WHERE r.submission_id = s.id) AS last_reply_at
     FROM interest_submissions s
     JOIN people p ON p.id = s.person_id
     ${whereSql}
     ORDER BY ${orderBy}
     LIMIT ? OFFSET ?`,
  ).bind(...bindings, pageSize, (page - 1) * pageSize).all<SubmissionListRow>();
  const [summary, filterOptions] = await Promise.all([adminSummary(env), adminFilterOptions(env)]);

  return adminJson({
    submissions: result.results.map(row => ({
      id: row.id,
      firstName: row.first_name,
      lastName: row.last_name,
      email: row.email,
      phone: row.phone,
      contactPreference: row.contact_preference,
      fieldOfStudy: row.field_of_study,
      preferredTiming: row.preferred_timing,
      message: row.message,
      createdAt: row.created_at,
      interests: parseJsonArray(row.interests_json),
      replyCount: Number(row.reply_count ?? 0),
      lastReplyAt: row.last_reply_at,
    })),
    summary,
    filterOptions,
    pagination: {
      page,
      pageSize,
      total: Number(countRow?.total ?? 0),
      pages: Math.max(1, Math.ceil(Number(countRow?.total ?? 0) / pageSize)),
    },
  });
}

async function listPeople(request: Request, env: AdminEnv): Promise<Response> {
  await authenticate(request, env);
  const url = new URL(request.url);
  const filters = adminFilters(url);
  const page = positiveInteger(url.searchParams.get("page"), 1, 10_000);
  const pageSize = positiveInteger(url.searchParams.get("pageSize"), 25, 50);
  const { whereSql, bindings } = filterSql(filters, "person");
  const orderBy: Record<string, string> = {
    newest: "latest_activity_at DESC",
    oldest: "latest_activity_at ASC",
    name_asc: "p.last_name COLLATE NOCASE ASC, p.first_name COLLATE NOCASE ASC",
    name_desc: "p.last_name COLLATE NOCASE DESC, p.first_name COLLATE NOCASE DESC",
  };
  const selectedOrder = orderBy[filters.sort] ?? orderBy.newest;
  const countRow = await env.DB.prepare(
    `SELECT COUNT(*) AS total FROM people p ${whereSql}`,
  ).bind(...bindings).first<{ total: number }>();
  const result = await env.DB.prepare(
    `SELECT
       p.id, p.first_name, p.last_name, p.email, p.phone, p.contact_preference, p.field_of_study,
       p.organization, p.contact_status, p.record_source, p.created_at, p.updated_at,
       (SELECT MIN(s.created_at) FROM interest_submissions s WHERE s.person_id = p.id) AS first_submission_at,
       (SELECT MAX(s.created_at) FROM interest_submissions s WHERE s.person_id = p.id) AS last_submission_at,
       COALESCE((SELECT MAX(s.created_at) FROM interest_submissions s WHERE s.person_id = p.id), p.updated_at) AS latest_activity_at,
       (SELECT COUNT(*) FROM interest_submissions s WHERE s.person_id = p.id) AS submission_count,
       (SELECT COUNT(*) FROM submission_replies r
        JOIN interest_submissions s ON s.id = r.submission_id WHERE s.person_id = p.id) AS reply_count,
       COALESCE((
         SELECT json_group_array(json_object(
           'id', selected.id,
           'slug', selected.slug,
           'title', selected.title,
           'kind', selected.kind,
           'location', selected.location,
           'partner', selected.partner,
           'duration', selected.duration,
           'status', selected.status,
           'createdAt', selected.created_at,
           'updatedAt', selected.updated_at
         ))
         FROM (
           SELECT i.id, i.status, i.created_at, i.updated_at,
                  o.slug, o.title, o.kind, o.location, o.partner, o.duration
           FROM interests i JOIN opportunities o ON o.id = i.opportunity_id
           WHERE i.person_id = p.id ORDER BY o.kind, o.sort_order
         ) selected
       ), '[]') AS interests_json,
       COALESCE((
         SELECT json_group_array(json_object(
           'id', selected_team.id,
           'name', selected_team.name,
           'status', selected_team.status,
           'assignedAt', selected_team.assigned_at
         ))
         FROM (
           SELECT t.id, t.name, t.status, tm.assigned_at
           FROM team_members tm JOIN teams t ON t.id = tm.team_id
           WHERE tm.person_id = p.id ORDER BY t.name_normalized
         ) selected_team
       ), '[]') AS teams_json,
       COALESCE((
         SELECT json_group_array(selected_type.contact_type)
         FROM (SELECT ct.contact_type FROM contact_types ct WHERE ct.person_id = p.id ORDER BY ct.contact_type) selected_type
       ), '[]') AS contact_types_json,
       COALESCE((
         SELECT json_group_array(selected_language.language)
         FROM (SELECT cl.language FROM contact_languages cl WHERE cl.person_id = p.id ORDER BY cl.language_normalized) selected_language
       ), '[]') AS languages_json,
       COALESCE((
         SELECT json_group_array(selected_area.area)
         FROM (SELECT ca.area FROM contact_areas ca WHERE ca.person_id = p.id ORDER BY ca.area) selected_area
       ), '[]') AS areas_json,
       COALESCE((
         SELECT json_group_array(json_object(
           'id', selected_trip.id, 'slug', selected_trip.slug, 'title', selected_trip.title,
           'location', selected_trip.location, 'partner', selected_trip.partner
         ))
         FROM (
           SELECT o.id, o.slug, o.title, o.location, o.partner
           FROM contact_trips ct JOIN opportunities o ON o.id = ct.opportunity_id
           WHERE ct.person_id = p.id ORDER BY o.sort_order
         ) selected_trip
       ), '[]') AS trips_json
     FROM people p
     ${whereSql}
     ORDER BY ${selectedOrder}
     LIMIT ? OFFSET ?`,
  ).bind(...bindings, pageSize, (page - 1) * pageSize).all<PeopleListRow>();
  const [summary, filterOptions] = await Promise.all([adminSummary(env), adminFilterOptions(env)]);
  return adminJson({
    people: result.results.map(row => ({
      id: row.id,
      firstName: row.first_name,
      lastName: row.last_name,
      email: row.email,
      phone: row.phone,
      contactPreference: row.contact_preference,
      fieldOfStudy: row.field_of_study,
      organization: row.organization,
      contactStatus: row.contact_status,
      recordSource: row.record_source,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      firstSubmissionAt: row.first_submission_at,
      lastSubmissionAt: row.last_submission_at,
      latestActivityAt: row.latest_activity_at,
      submissionCount: Number(row.submission_count ?? 0),
      replyCount: Number(row.reply_count ?? 0),
      interests: parseJsonArray(row.interests_json),
      teams: parseJsonArray(row.teams_json),
      contactTypes: parseJsonArray(row.contact_types_json),
      languages: parseJsonArray(row.languages_json),
      areas: parseJsonArray(row.areas_json),
      trips: parseJsonArray(row.trips_json),
    })),
    summary,
    filterOptions,
    pagination: {
      page,
      pageSize,
      total: Number(countRow?.total ?? 0),
      pages: Math.max(1, Math.ceil(Number(countRow?.total ?? 0) / pageSize)),
    },
  });
}

async function validateContactTrips(env: AdminEnv, tripIds: string[]): Promise<void> {
  if (!tripIds.length) return;
  const placeholders = tripIds.map((_, index) => `?${index + 1}`).join(", ");
  const found = await env.DB.prepare(
    `SELECT COUNT(*) AS total FROM opportunities WHERE kind = 'trip' AND id IN (${placeholders})`,
  ).bind(...tripIds).first<{ total: number }>();
  if (Number(found?.total ?? 0) !== tripIds.length) {
    throw new AdminError(422, "INVALID_TRIPS", "One of the selected trips no longer exists.");
  }
}

function contactRelationStatements(env: AdminEnv, personId: string, input: ContactInput, now: string): D1PreparedStatement[] {
  return [
    ...input.contactTypes.map(contactType => env.DB.prepare(
      "INSERT INTO contact_types (person_id, contact_type, created_at) VALUES (?1, ?2, ?3)",
    ).bind(personId, contactType, now)),
    ...input.languages.map(language => env.DB.prepare(
      `INSERT INTO contact_languages (person_id, language, language_normalized, created_at)
       VALUES (?1, ?2, ?3, ?4)`,
    ).bind(personId, language, normalizeTeamName(language), now)),
    ...input.areas.map(area => env.DB.prepare(
      "INSERT INTO contact_areas (person_id, area, created_at) VALUES (?1, ?2, ?3)",
    ).bind(personId, area, now)),
    ...input.tripIds.map(tripId => env.DB.prepare(
      "INSERT INTO contact_trips (person_id, opportunity_id, created_at) VALUES (?1, ?2, ?3)",
    ).bind(personId, tripId, now)),
  ];
}

async function createContact(request: Request, env: AdminEnv): Promise<Response> {
  await authenticate(request, env, true);
  const input = contactInput(await readAdminJson(request));
  await validateContactTrips(env, input.tripIds);
  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  const emailNormalized = input.email.toLocaleLowerCase("en-US");
  const phoneNormalized = input.phone?.replace(/\D/g, "") ?? null;
  try {
    await env.DB.batch([
      env.DB.prepare(
        `INSERT INTO people (
           id, first_name, last_name, first_name_normalized, last_name_normalized,
           email, email_normalized, phone, phone_normalized, contact_preference, field_of_study,
           preferred_name, address_line_1, address_line_2, city, region, postal_code, country,
           organization, website, notes, record_source, contact_status, last_contacted_at,
           created_at, updated_at
         ) VALUES (
           ?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13,
           ?14, ?15, ?16, ?17, ?18, ?19, ?20, ?21, 'manual', ?22, ?23, ?24, ?25
         )`,
      ).bind(
        id, input.firstName, input.lastName, normalizeTeamName(input.firstName), normalizeTeamName(input.lastName),
        input.email, emailNormalized, input.phone, phoneNormalized, input.contactPreference, input.fieldOfStudy,
        input.preferredName, input.addressLine1, input.addressLine2, input.city, input.region, input.postalCode,
        input.country, input.organization, input.website, input.notes, input.contactStatus, input.lastContactedAt,
        now, now,
      ),
      ...contactRelationStatements(env, id, input, now),
      auditStatement(env, "person", id, "contact_created", { recordSource: "manual" }),
    ]);
  } catch (error) {
    if (error instanceof Error && error.message.includes("UNIQUE constraint failed")) {
      throw new AdminError(409, "CONTACT_EXISTS", "A contact with this name and email already exists.");
    }
    throw error;
  }
  return adminJson({ success: true, personId: id }, 201);
}

async function updateContact(request: Request, env: AdminEnv, personId: string): Promise<Response> {
  await authenticate(request, env, true);
  const input = contactInput(await readAdminJson(request));
  await validateContactTrips(env, input.tripIds);
  const existing = await env.DB.prepare("SELECT id FROM people WHERE id = ?1 LIMIT 1")
    .bind(personId).first<{ id: string }>();
  if (!existing) throw new AdminError(404, "PERSON_NOT_FOUND", "This contact was not found.");
  const now = new Date().toISOString();
  const emailNormalized = input.email.toLocaleLowerCase("en-US");
  const phoneNormalized = input.phone?.replace(/\D/g, "") ?? null;
  try {
    await env.DB.batch([
      env.DB.prepare(
        `UPDATE people SET
           first_name = ?1, last_name = ?2, first_name_normalized = ?3, last_name_normalized = ?4,
           email = ?5, email_normalized = ?6, phone = ?7, phone_normalized = ?8,
           contact_preference = ?9, field_of_study = ?10, preferred_name = ?11,
           address_line_1 = ?12, address_line_2 = ?13, city = ?14, region = ?15,
           postal_code = ?16, country = ?17, organization = ?18, website = ?19, notes = ?20,
           contact_status = ?21, last_contacted_at = ?22, updated_at = ?23
         WHERE id = ?24`,
      ).bind(
        input.firstName, input.lastName, normalizeTeamName(input.firstName), normalizeTeamName(input.lastName),
        input.email, emailNormalized, input.phone, phoneNormalized, input.contactPreference, input.fieldOfStudy,
        input.preferredName, input.addressLine1, input.addressLine2, input.city, input.region, input.postalCode,
        input.country, input.organization, input.website, input.notes, input.contactStatus, input.lastContactedAt,
        now, personId,
      ),
      env.DB.prepare("DELETE FROM contact_types WHERE person_id = ?1").bind(personId),
      env.DB.prepare("DELETE FROM contact_languages WHERE person_id = ?1").bind(personId),
      env.DB.prepare("DELETE FROM contact_areas WHERE person_id = ?1").bind(personId),
      env.DB.prepare("DELETE FROM contact_trips WHERE person_id = ?1").bind(personId),
      ...contactRelationStatements(env, personId, input, now),
      auditStatement(env, "person", personId, "contact_updated"),
    ]);
  } catch (error) {
    if (error instanceof Error && error.message.includes("UNIQUE constraint failed")) {
      throw new AdminError(409, "CONTACT_EXISTS", "A contact with this name and email already exists.");
    }
    throw error;
  }
  return adminJson({ success: true, personId, updatedAt: now });
}

async function personDetail(request: Request, env: AdminEnv, personId: string): Promise<Response> {
  await authenticate(request, env);
  const person = await env.DB.prepare(
    `SELECT id, first_name, last_name, preferred_name, email, phone, contact_preference, field_of_study,
            address_line_1, address_line_2, city, region, postal_code, country,
            organization, website, notes, record_source, contact_status, last_contacted_at,
            created_at, updated_at
     FROM people WHERE id = ?1 LIMIT 1`,
  ).bind(personId).first<Record<string, string | null>>();
  if (!person) throw new AdminError(404, "PERSON_NOT_FOUND", "This person was not found.");

  const [interests, submissions, replies, registrations, teams, contactTypes, languages, areas, trips, ministries, tripOptions] = await Promise.all([
    env.DB.prepare(
      `SELECT i.id, i.status, i.created_at, i.updated_at, i.submission_id,
              o.slug, o.title, o.kind, o.location, o.partner, o.duration
       FROM interests i JOIN opportunities o ON o.id = i.opportunity_id
       WHERE i.person_id = ?1 ORDER BY o.kind, o.sort_order`,
    ).bind(personId).all<Record<string, string | null>>(),
    env.DB.prepare(
      `SELECT s.id, s.preferred_timing, s.message, s.source_page, s.consent_at, s.created_at,
              COALESCE((
                SELECT json_group_array(json_object(
                  'id', selected.interest_id,
                  'slug', selected.slug,
                  'title', selected.title,
                  'kind', selected.kind,
                  'location', selected.location,
                  'partner', selected.partner,
                  'duration', selected.duration,
                  'status', selected.status
                ))
                FROM (
                  SELECT i.id AS interest_id, o.slug, o.title, o.kind, o.location, o.partner, o.duration,
                         COALESCE(i.status, 'new') AS status
                  FROM json_each(s.selected_opportunities_json) requested
                  JOIN opportunities o ON o.slug = requested.value
                  LEFT JOIN interests i ON i.person_id = s.person_id AND i.opportunity_id = o.id
                  ORDER BY o.sort_order
                ) selected
              ), '[]') AS interests_json
       FROM interest_submissions s WHERE s.person_id = ?1 ORDER BY s.created_at DESC`,
    ).bind(personId).all<PersonSubmissionRow>(),
    env.DB.prepare(
      `SELECT r.id, r.submission_id, s.created_at AS submission_created_at,
              r.recipient_email, r.subject, r.body, r.delivery_method,
              r.delivery_status, r.provider_message_id, r.error_message, r.created_at, r.sent_at, r.updated_at
       FROM submission_replies r
       JOIN interest_submissions s ON s.id = r.submission_id
       WHERE s.person_id = ?1 ORDER BY r.created_at DESC`,
    ).bind(personId).all<Record<string, string | null>>(),
    env.DB.prepare(
      `SELECT tr.id, tr.status, tr.started_at, tr.submitted_at, tr.updated_at,
              o.slug, o.title, o.location
       FROM trip_registrations tr JOIN opportunities o ON o.id = tr.opportunity_id
       WHERE tr.person_id = ?1 ORDER BY tr.updated_at DESC`,
    ).bind(personId).all<Record<string, string | null>>(),
    env.DB.prepare(
      `SELECT t.id, t.name, t.description, t.status, tm.assigned_at,
              CASE WHEN tm.person_id IS NULL THEN 0 ELSE 1 END AS assigned
       FROM teams t
       LEFT JOIN team_members tm ON tm.team_id = t.id AND tm.person_id = ?1
       WHERE t.status = 'active' OR tm.person_id IS NOT NULL
       ORDER BY t.name_normalized`,
    ).bind(personId).all<Record<string, string | number | null>>(),
    env.DB.prepare(
      "SELECT contact_type FROM contact_types WHERE person_id = ?1 ORDER BY contact_type",
    ).bind(personId).all<{ contact_type: string }>(),
    env.DB.prepare(
      "SELECT language FROM contact_languages WHERE person_id = ?1 ORDER BY language_normalized",
    ).bind(personId).all<{ language: string }>(),
    env.DB.prepare(
      "SELECT area FROM contact_areas WHERE person_id = ?1 ORDER BY area",
    ).bind(personId).all<{ area: string }>(),
    env.DB.prepare(
      `SELECT o.id, o.slug, o.title, o.location, o.partner
       FROM contact_trips ct JOIN opportunities o ON o.id = ct.opportunity_id
       WHERE ct.person_id = ?1 ORDER BY o.sort_order`,
    ).bind(personId).all<Record<string, string | null>>(),
    env.DB.prepare(
      `SELECT m.id, m.name, m.status, mc.role, mc.is_primary
       FROM ministry_contacts mc JOIN ministries m ON m.id = mc.ministry_id
       WHERE mc.person_id = ?1 ORDER BY m.name_normalized`,
    ).bind(personId).all<Record<string, string | number | null>>(),
    env.DB.prepare(
      `SELECT id, slug, title, location, partner
       FROM opportunities WHERE kind = 'trip' AND active = 1 ORDER BY sort_order`,
    ).all<Record<string, string | null>>(),
  ]);
  const submissionHistory = submissions.results.map(row => ({
    id: row.id,
    preferredTiming: row.preferred_timing,
    message: row.message,
    sourcePage: row.source_page,
    consentAt: row.consent_at,
    createdAt: row.created_at,
    interests: parseJsonArray(row.interests_json),
  }));
  return adminJson({
    person: {
      id: person.id,
      firstName: person.first_name,
      lastName: person.last_name,
      preferredName: person.preferred_name,
      email: person.email,
      phone: person.phone,
      contactPreference: person.contact_preference,
      fieldOfStudy: person.field_of_study,
      addressLine1: person.address_line_1,
      addressLine2: person.address_line_2,
      city: person.city,
      region: person.region,
      postalCode: person.postal_code,
      country: person.country,
      organization: person.organization,
      website: person.website,
      notes: person.notes,
      recordSource: person.record_source,
      contactStatus: person.contact_status,
      lastContactedAt: person.last_contacted_at,
      createdAt: person.created_at,
      updatedAt: person.updated_at,
      latestSubmissionId: submissionHistory[0]?.id ?? null,
      interests: interests.results.map(row => ({
        id: row.id,
        status: row.status,
        submissionId: row.submission_id,
        slug: row.slug,
        title: row.title,
        kind: row.kind,
        location: row.location,
        partner: row.partner,
        duration: row.duration,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
      })),
      submissions: submissionHistory,
      replies: replies.results.map(row => ({
        id: row.id,
        submissionId: row.submission_id,
        submissionCreatedAt: row.submission_created_at,
        recipientEmail: row.recipient_email,
        subject: row.subject,
        body: row.body,
        deliveryMethod: row.delivery_method,
        deliveryStatus: row.delivery_status,
        providerMessageId: row.provider_message_id,
        errorMessage: row.error_message,
        createdAt: row.created_at,
        sentAt: row.sent_at,
        updatedAt: row.updated_at,
      })),
      registrations: registrations.results.map(row => ({
        id: row.id,
        status: row.status,
        slug: row.slug,
        title: row.title,
        location: row.location,
        startedAt: row.started_at,
        submittedAt: row.submitted_at,
        updatedAt: row.updated_at,
      })),
      contactTypes: contactTypes.results.map(row => row.contact_type),
      languages: languages.results.map(row => row.language),
      areas: areas.results.map(row => row.area),
      trips: trips.results.map(row => ({
        id: row.id,
        slug: row.slug,
        title: row.title,
        location: row.location,
        partner: row.partner,
      })),
      ministries: ministries.results.map(row => ({
        id: row.id,
        name: row.name,
        status: row.status,
        role: row.role,
        isPrimary: Boolean(row.is_primary),
      })),
      options: {
        contactTypes: CONTACT_TYPE_OPTIONS.map(([value, label]) => ({ value, label })),
        contactAreas: CONTACT_AREA_OPTIONS.map(([value, label]) => ({ value, label })),
        trips: tripOptions.results,
      },
      teams: teams.results.map(row => ({
        id: row.id,
        name: row.name,
        description: row.description,
        status: row.status,
        assigned: Boolean(row.assigned),
        assignedAt: row.assigned_at,
      })),
    },
  });
}

function ministryTripStatements(env: AdminEnv, ministryId: string, tripIds: string[], now: string): D1PreparedStatement[] {
  return tripIds.map(tripId => env.DB.prepare(
    "INSERT INTO ministry_opportunities (ministry_id, opportunity_id, created_at) VALUES (?1, ?2, ?3)",
  ).bind(ministryId, tripId, now));
}

async function listMinistries(request: Request, env: AdminEnv): Promise<Response> {
  await authenticate(request, env);
  const result = await env.DB.prepare(
    `SELECT m.id, m.name, m.description, m.city, m.region, m.country, m.email, m.phone, m.website,
            m.status, m.created_at, m.updated_at,
            (SELECT COUNT(*) FROM ministry_contacts mc WHERE mc.ministry_id = m.id) AS contact_count,
            (SELECT COUNT(*) FROM ministry_opportunities mo WHERE mo.ministry_id = m.id) AS opportunity_count
     FROM ministries m
     ORDER BY CASE m.status WHEN 'active' THEN 0 ELSE 1 END, m.name_normalized`,
  ).all<MinistryListRow>();
  return adminJson({
    ministries: result.results.map(row => ({
      id: row.id,
      name: row.name,
      description: row.description,
      city: row.city,
      region: row.region,
      country: row.country,
      email: row.email,
      phone: row.phone,
      website: row.website,
      status: row.status,
      contactCount: Number(row.contact_count ?? 0),
      opportunityCount: Number(row.opportunity_count ?? 0),
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    })),
  });
}

async function createMinistry(request: Request, env: AdminEnv): Promise<Response> {
  await authenticate(request, env, true);
  const input = ministryInput(await readAdminJson(request));
  await validateContactTrips(env, input.tripIds);
  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  try {
    await env.DB.batch([
      env.DB.prepare(
        `INSERT INTO ministries (
           id, name, name_normalized, description, address_line_1, address_line_2, city, region,
           postal_code, country, email, phone, website, notes, status, created_at, updated_at
         ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16, ?17)`,
      ).bind(
        id, input.name, normalizeTeamName(input.name), input.description, input.addressLine1, input.addressLine2,
        input.city, input.region, input.postalCode, input.country, input.email, input.phone, input.website,
        input.notes, input.status, now, now,
      ),
      ...ministryTripStatements(env, id, input.tripIds, now),
      auditStatement(env, "ministry", id, "created", { name: input.name }),
    ]);
  } catch (error) {
    if (error instanceof Error && error.message.includes("UNIQUE constraint failed")) {
      throw new AdminError(409, "MINISTRY_EXISTS", "A ministry with that name already exists.");
    }
    throw error;
  }
  return adminJson({ success: true, ministryId: id }, 201);
}

async function ministryDetail(request: Request, env: AdminEnv, ministryId: string): Promise<Response> {
  await authenticate(request, env);
  const ministry = await env.DB.prepare(
    `SELECT id, name, description, address_line_1, address_line_2, city, region, postal_code, country,
            email, phone, website, notes, status, created_at, updated_at
     FROM ministries WHERE id = ?1 LIMIT 1`,
  ).bind(ministryId).first<Record<string, string | null>>();
  if (!ministry) throw new AdminError(404, "MINISTRY_NOT_FOUND", "This ministry was not found.");

  const [contacts, availableContacts, trips, tripOptions] = await Promise.all([
    env.DB.prepare(
      `SELECT p.id, p.first_name, p.last_name, p.email, p.phone, p.organization,
              mc.role, mc.is_primary, mc.created_at, mc.updated_at
       FROM ministry_contacts mc JOIN people p ON p.id = mc.person_id
       WHERE mc.ministry_id = ?1
       ORDER BY mc.is_primary DESC, p.last_name_normalized, p.first_name_normalized`,
    ).bind(ministryId).all<Record<string, string | number | null>>(),
    env.DB.prepare(
      `SELECT p.id, p.first_name, p.last_name, p.email, p.phone, p.organization
       FROM people p
       WHERE p.contact_status = 'active'
         AND NOT EXISTS (
           SELECT 1 FROM ministry_contacts mc WHERE mc.ministry_id = ?1 AND mc.person_id = p.id
         )
       ORDER BY p.last_name_normalized, p.first_name_normalized LIMIT 500`,
    ).bind(ministryId).all<Record<string, string | null>>(),
    env.DB.prepare(
      `SELECT o.id, o.slug, o.title, o.location, o.partner
       FROM ministry_opportunities mo JOIN opportunities o ON o.id = mo.opportunity_id
       WHERE mo.ministry_id = ?1 ORDER BY o.sort_order`,
    ).bind(ministryId).all<Record<string, string | null>>(),
    env.DB.prepare(
      "SELECT id, slug, title, location, partner FROM opportunities WHERE kind = 'trip' AND active = 1 ORDER BY sort_order",
    ).all<Record<string, string | null>>(),
  ]);
  return adminJson({
    ministry: {
      id: ministry.id,
      name: ministry.name,
      description: ministry.description,
      addressLine1: ministry.address_line_1,
      addressLine2: ministry.address_line_2,
      city: ministry.city,
      region: ministry.region,
      postalCode: ministry.postal_code,
      country: ministry.country,
      email: ministry.email,
      phone: ministry.phone,
      website: ministry.website,
      notes: ministry.notes,
      status: ministry.status,
      createdAt: ministry.created_at,
      updatedAt: ministry.updated_at,
      contacts: contacts.results.map(row => ({
        id: row.id,
        firstName: row.first_name,
        lastName: row.last_name,
        email: row.email,
        phone: row.phone,
        organization: row.organization,
        role: row.role,
        isPrimary: Boolean(row.is_primary),
        linkedAt: row.created_at,
      })),
      availableContacts: availableContacts.results.map(row => ({
        id: row.id,
        firstName: row.first_name,
        lastName: row.last_name,
        email: row.email,
        phone: row.phone,
        organization: row.organization,
      })),
      trips: trips.results,
      options: { trips: tripOptions.results },
    },
  });
}

async function updateMinistry(request: Request, env: AdminEnv, ministryId: string): Promise<Response> {
  await authenticate(request, env, true);
  const input = ministryInput(await readAdminJson(request));
  await validateContactTrips(env, input.tripIds);
  const existing = await env.DB.prepare("SELECT id FROM ministries WHERE id = ?1 LIMIT 1")
    .bind(ministryId).first<{ id: string }>();
  if (!existing) throw new AdminError(404, "MINISTRY_NOT_FOUND", "This ministry was not found.");
  const now = new Date().toISOString();
  try {
    await env.DB.batch([
      env.DB.prepare(
        `UPDATE ministries SET
           name = ?1, name_normalized = ?2, description = ?3, address_line_1 = ?4, address_line_2 = ?5,
           city = ?6, region = ?7, postal_code = ?8, country = ?9, email = ?10, phone = ?11,
           website = ?12, notes = ?13, status = ?14, updated_at = ?15
         WHERE id = ?16`,
      ).bind(
        input.name, normalizeTeamName(input.name), input.description, input.addressLine1, input.addressLine2,
        input.city, input.region, input.postalCode, input.country, input.email, input.phone, input.website,
        input.notes, input.status, now, ministryId,
      ),
      env.DB.prepare("DELETE FROM ministry_opportunities WHERE ministry_id = ?1").bind(ministryId),
      ...ministryTripStatements(env, ministryId, input.tripIds, now),
      auditStatement(env, "ministry", ministryId, "updated"),
    ]);
  } catch (error) {
    if (error instanceof Error && error.message.includes("UNIQUE constraint failed")) {
      throw new AdminError(409, "MINISTRY_EXISTS", "A ministry with that name already exists.");
    }
    throw error;
  }
  return adminJson({ success: true, ministryId, updatedAt: now });
}

async function addMinistryContact(request: Request, env: AdminEnv, ministryId: string): Promise<Response> {
  await authenticate(request, env, true);
  const body = await readAdminJson(request);
  const personId = typeof body.personId === "string" ? body.personId : "";
  if (!isUuid(personId)) throw new AdminError(422, "INVALID_PERSON", "Choose a valid contact.");
  const role = cleanOptionalLine(body.role, 120);
  const isPrimary = body.isPrimary === true ? 1 : 0;
  const now = new Date().toISOString();
  const result = await env.DB.batch([
    env.DB.prepare(
      `INSERT INTO ministry_contacts (ministry_id, person_id, role, is_primary, created_at, updated_at)
       SELECT m.id, p.id, ?1, ?2, ?3, ?4 FROM ministries m, people p
       WHERE m.id = ?5 AND p.id = ?6
       ON CONFLICT (ministry_id, person_id) DO UPDATE SET
         role = excluded.role, is_primary = excluded.is_primary, updated_at = excluded.updated_at`,
    ).bind(role, isPrimary, now, now, ministryId, personId),
    env.DB.prepare(
      `INSERT OR IGNORE INTO contact_types (person_id, contact_type, created_at)
       SELECT id, 'ministry_contact', ?1 FROM people WHERE id = ?2`,
    ).bind(now, personId),
    auditStatement(env, "ministry", ministryId, "contact_linked", { personId, role, isPrimary: Boolean(isPrimary) }),
  ]);
  if (Number(result[0]?.meta.changes ?? 0) !== 1) {
    throw new AdminError(404, "MINISTRY_OR_PERSON_NOT_FOUND", "The ministry or contact was not found.");
  }
  return adminJson({ success: true, ministryId, personId }, 201);
}

async function removeMinistryContact(request: Request, env: AdminEnv, ministryId: string): Promise<Response> {
  await authenticate(request, env, true);
  const body = await readAdminJson(request);
  const personId = typeof body.personId === "string" ? body.personId : "";
  if (!isUuid(personId)) throw new AdminError(422, "INVALID_PERSON", "Choose a valid contact.");
  const result = await env.DB.batch([
    env.DB.prepare("DELETE FROM ministry_contacts WHERE ministry_id = ?1 AND person_id = ?2").bind(ministryId, personId),
    env.DB.prepare(
      `DELETE FROM contact_types WHERE person_id = ?1 AND contact_type = 'ministry_contact'
       AND NOT EXISTS (SELECT 1 FROM ministry_contacts WHERE person_id = ?1)`,
    ).bind(personId),
    auditStatement(env, "ministry", ministryId, "contact_unlinked", { personId }),
  ]);
  if (Number(result[0]?.meta.changes ?? 0) !== 1) {
    throw new AdminError(404, "MINISTRY_CONTACT_NOT_FOUND", "This contact is not linked to the ministry.");
  }
  return adminJson({ success: true, ministryId, personId });
}

async function deleteMinistry(request: Request, env: AdminEnv, ministryId: string): Promise<Response> {
  await authenticate(request, env, true);
  const ministry = await env.DB.prepare(
    `SELECT id, name,
            (SELECT COUNT(*) FROM ministry_contacts mc WHERE mc.ministry_id = ministries.id) AS contact_count,
            (SELECT COUNT(*) FROM ministry_opportunities mo WHERE mo.ministry_id = ministries.id) AS opportunity_count
     FROM ministries WHERE id = ?1 LIMIT 1`,
  ).bind(ministryId).first<{ id: string; name: string; contact_count: number; opportunity_count: number }>();
  if (!ministry) throw new AdminError(404, "MINISTRY_NOT_FOUND", "This ministry was not found.");
  const deleted = {
    contacts: Number(ministry.contact_count ?? 0),
    trips: Number(ministry.opportunity_count ?? 0),
  };
  await env.DB.batch([
    env.DB.prepare("DELETE FROM ministry_contacts WHERE ministry_id = ?1").bind(ministryId),
    env.DB.prepare("DELETE FROM ministry_opportunities WHERE ministry_id = ?1").bind(ministryId),
    env.DB.prepare("DELETE FROM ministries WHERE id = ?1").bind(ministryId),
    auditStatement(env, "ministry", ministryId, "deleted", { ...deleted, name: ministry.name }),
  ]);
  return adminJson({ success: true, ministryId, deleted });
}

async function listTeams(request: Request, env: AdminEnv): Promise<Response> {
  await authenticate(request, env);
  const result = await env.DB.prepare(
    `SELECT t.id, t.name, t.description, t.status, t.created_at, t.updated_at,
            COUNT(tm.person_id) AS member_count, MAX(tm.assigned_at) AS latest_assignment_at
     FROM teams t
     LEFT JOIN team_members tm ON tm.team_id = t.id
     GROUP BY t.id
     ORDER BY CASE t.status WHEN 'active' THEN 0 ELSE 1 END, t.name_normalized`,
  ).all<TeamListRow>();
  return adminJson({
    teams: result.results.map(row => ({
      id: row.id,
      name: row.name,
      description: row.description,
      status: row.status,
      memberCount: Number(row.member_count ?? 0),
      latestAssignmentAt: row.latest_assignment_at,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    })),
  });
}

async function createTeam(request: Request, env: AdminEnv): Promise<Response> {
  await authenticate(request, env, true);
  const body = await readAdminJson(request);
  const name = cleanLine(body.name, 100);
  const description = cleanOptionalMessage(body.description, 500);
  if (!name) throw new AdminError(422, "INVALID_TEAM", "Enter a team name using 100 characters or fewer.");
  if (body.description && !description) {
    throw new AdminError(422, "INVALID_TEAM", "Use 500 characters or fewer for the team description.");
  }
  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  try {
    await env.DB.prepare(
      `INSERT INTO teams (id, name, name_normalized, description, status, created_at, updated_at)
       VALUES (?1, ?2, ?3, ?4, 'active', ?5, ?6)`,
    ).bind(id, name, normalizeTeamName(name), description, now, now).run();
  } catch (error) {
    if (error instanceof Error && error.message.includes("UNIQUE constraint failed")) {
      throw new AdminError(409, "TEAM_EXISTS", "A team with that name already exists.");
    }
    throw error;
  }
  await audit(env, "team", id, "created", { name });
  return adminJson({
    success: true,
    team: { id, name, description, status: "active", memberCount: 0, createdAt: now, updatedAt: now },
  }, 201);
}

async function teamDetail(request: Request, env: AdminEnv, teamId: string): Promise<Response> {
  await authenticate(request, env);
  const team = await env.DB.prepare(
    `SELECT id, name, description, status, created_at, updated_at
     FROM teams WHERE id = ?1 LIMIT 1`,
  ).bind(teamId).first<Record<string, string | null>>();
  if (!team) throw new AdminError(404, "TEAM_NOT_FOUND", "This team was not found.");

  const [members, availablePeople] = await Promise.all([
    env.DB.prepare(
      `SELECT p.id, p.first_name, p.last_name, p.email, p.phone, p.contact_preference, p.field_of_study,
              p.created_at, p.updated_at, tm.assigned_at,
              (SELECT MIN(s.created_at) FROM interest_submissions s WHERE s.person_id = p.id) AS first_submission_at,
              (SELECT MAX(s.created_at) FROM interest_submissions s WHERE s.person_id = p.id) AS last_submission_at,
              (SELECT COUNT(*) FROM interest_submissions s WHERE s.person_id = p.id) AS submission_count,
              (SELECT COUNT(*) FROM submission_replies r
               JOIN interest_submissions s ON s.id = r.submission_id WHERE s.person_id = p.id) AS reply_count,
              COALESCE((
                SELECT json_group_array(json_object(
                  'id', selected.id, 'slug', selected.slug, 'title', selected.title, 'kind', selected.kind,
                  'location', selected.location, 'partner', selected.partner, 'duration', selected.duration,
                  'status', selected.status, 'createdAt', selected.created_at, 'updatedAt', selected.updated_at
                ))
                FROM (
                  SELECT i.id, i.status, i.created_at, i.updated_at,
                         o.slug, o.title, o.kind, o.location, o.partner, o.duration
                  FROM interests i JOIN opportunities o ON o.id = i.opportunity_id
                  WHERE i.person_id = p.id ORDER BY o.kind, o.sort_order
                ) selected
              ), '[]') AS interests_json
       FROM team_members tm JOIN people p ON p.id = tm.person_id
       WHERE tm.team_id = ?1
       ORDER BY p.last_name COLLATE NOCASE, p.first_name COLLATE NOCASE`,
    ).bind(teamId).all<Record<string, string | number | null>>(),
    env.DB.prepare(
      `SELECT p.id, p.first_name, p.last_name, p.email, p.phone,
              COALESCE((
                SELECT json_group_array(json_object('title', selected.title, 'status', selected.status))
                FROM (
                  SELECT o.title, i.status
                  FROM interests i JOIN opportunities o ON o.id = i.opportunity_id
                  WHERE i.person_id = p.id ORDER BY o.kind, o.sort_order
                ) selected
              ), '[]') AS interests_json
       FROM people p
       WHERE NOT EXISTS (
         SELECT 1 FROM team_members tm WHERE tm.team_id = ?1 AND tm.person_id = p.id
       )
       ORDER BY p.last_name COLLATE NOCASE, p.first_name COLLATE NOCASE
       LIMIT 500`,
    ).bind(teamId).all<Record<string, string | null>>(),
  ]);

  return adminJson({
    team: {
      id: team.id,
      name: team.name,
      description: team.description,
      status: team.status,
      createdAt: team.created_at,
      updatedAt: team.updated_at,
      members: members.results.map(row => ({
        id: row.id,
        firstName: row.first_name,
        lastName: row.last_name,
        email: row.email,
        phone: row.phone,
        contactPreference: row.contact_preference,
        fieldOfStudy: row.field_of_study,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
        assignedAt: row.assigned_at,
        firstSubmissionAt: row.first_submission_at,
        lastSubmissionAt: row.last_submission_at,
        submissionCount: Number(row.submission_count ?? 0),
        replyCount: Number(row.reply_count ?? 0),
        interests: parseJsonArray(String(row.interests_json ?? "[]")),
      })),
      availablePeople: availablePeople.results.map(row => ({
        id: row.id,
        firstName: row.first_name,
        lastName: row.last_name,
        email: row.email,
        phone: row.phone,
        interests: parseJsonArray(row.interests_json ?? "[]"),
      })),
    },
  });
}

async function setPersonTeams(request: Request, env: AdminEnv, personId: string): Promise<Response> {
  await authenticate(request, env, true);
  const body = await readAdminJson(request);
  const requestedTeamIds = body.teamIds;
  if (!Array.isArray(requestedTeamIds) || requestedTeamIds.length > 30 || requestedTeamIds.some(id => typeof id !== "string" || !isUuid(id))) {
    throw new AdminError(422, "INVALID_TEAMS", "Choose valid teams for this person.");
  }
  const desiredTeamIds = [...new Set(requestedTeamIds.filter((id): id is string => typeof id === "string"))];
  const person = await env.DB.prepare("SELECT id FROM people WHERE id = ?1 LIMIT 1").bind(personId).first<{ id: string }>();
  if (!person) throw new AdminError(404, "PERSON_NOT_FOUND", "This person was not found.");

  if (desiredTeamIds.length) {
    const placeholders = desiredTeamIds.map((_, index) => `?${index + 1}`).join(", ");
    const found = await env.DB.prepare(`SELECT COUNT(*) AS total FROM teams WHERE id IN (${placeholders})`)
      .bind(...desiredTeamIds).first<{ total: number }>();
    if (Number(found?.total ?? 0) !== desiredTeamIds.length) {
      throw new AdminError(422, "INVALID_TEAMS", "One of the selected teams no longer exists.");
    }
  }

  const current = await env.DB.prepare("SELECT team_id FROM team_members WHERE person_id = ?1")
    .bind(personId).all<{ team_id: string }>();
  const currentIds = new Set(current.results.map(row => row.team_id));
  const desiredIds = new Set(desiredTeamIds);
  const toRemove = [...currentIds].filter(id => !desiredIds.has(id));
  const toAdd = desiredTeamIds.filter(id => !currentIds.has(id));
  const now = new Date().toISOString();
  const statements = [
    ...toRemove.map(teamId => env.DB.prepare("DELETE FROM team_members WHERE team_id = ?1 AND person_id = ?2").bind(teamId, personId)),
    ...toAdd.map(teamId => env.DB.prepare(
      "INSERT INTO team_members (team_id, person_id, assigned_at) VALUES (?1, ?2, ?3)",
    ).bind(teamId, personId, now)),
  ];
  if (statements.length) await env.DB.batch(statements);
  await audit(env, "person", personId, "teams_updated", { teamIds: desiredTeamIds, added: toAdd, removed: toRemove });
  return adminJson({ success: true, personId, teamIds: desiredTeamIds, added: toAdd.length, removed: toRemove.length });
}

async function addTeamMember(request: Request, env: AdminEnv, teamId: string): Promise<Response> {
  await authenticate(request, env, true);
  const body = await readAdminJson(request);
  const personId = typeof body.personId === "string" ? body.personId : "";
  if (!isUuid(personId)) throw new AdminError(422, "INVALID_PERSON", "Choose a valid person to add.");
  const now = new Date().toISOString();
  const result = await env.DB.prepare(
    `INSERT OR IGNORE INTO team_members (team_id, person_id, assigned_at)
     SELECT t.id, p.id, ?1 FROM teams t, people p
     WHERE t.id = ?2 AND t.status = 'active' AND p.id = ?3`,
  ).bind(now, teamId, personId).run();
  if (Number(result.meta.changes ?? 0) !== 1) {
    const existing = await env.DB.prepare(
      "SELECT 1 AS found FROM team_members WHERE team_id = ?1 AND person_id = ?2",
    ).bind(teamId, personId).first<{ found: number }>();
    if (existing) return adminJson({ success: true, alreadyAssigned: true, teamId, personId });
    throw new AdminError(404, "TEAM_OR_PERSON_NOT_FOUND", "The team or person was not found.");
  }
  await audit(env, "team", teamId, "member_added", { personId });
  return adminJson({ success: true, teamId, personId, assignedAt: now }, 201);
}

async function removeTeamMember(request: Request, env: AdminEnv, teamId: string): Promise<Response> {
  await authenticate(request, env, true);
  const body = await readAdminJson(request);
  const personId = typeof body.personId === "string" ? body.personId : "";
  if (!isUuid(personId)) throw new AdminError(422, "INVALID_PERSON", "Choose a valid person to remove.");
  const result = await env.DB.prepare("DELETE FROM team_members WHERE team_id = ?1 AND person_id = ?2")
    .bind(teamId, personId).run();
  if (Number(result.meta.changes ?? 0) !== 1) throw new AdminError(404, "TEAM_MEMBER_NOT_FOUND", "This person is not on the team.");
  await audit(env, "team", teamId, "member_removed", { personId });
  return adminJson({ success: true, teamId, personId });
}

async function deleteTeam(request: Request, env: AdminEnv, teamId: string): Promise<Response> {
  await authenticate(request, env, true);
  const team = await env.DB.prepare(
    `SELECT id, name,
            (SELECT COUNT(*) FROM team_members tm WHERE tm.team_id = teams.id) AS member_count
     FROM teams WHERE id = ?1 LIMIT 1`,
  ).bind(teamId).first<{ id: string; name: string; member_count: number }>();
  if (!team) throw new AdminError(404, "TEAM_NOT_FOUND", "This team was not found.");

  const memberCount = Number(team.member_count ?? 0);
  await env.DB.batch([
    env.DB.prepare("DELETE FROM team_members WHERE team_id = ?1").bind(teamId),
    env.DB.prepare("DELETE FROM teams WHERE id = ?1").bind(teamId),
    auditStatement(env, "team", teamId, "deleted", { memberCount }),
  ]);
  return adminJson({ success: true, teamId, deletedMembers: memberCount });
}

async function deleteSubmission(request: Request, env: AdminEnv, submissionId: string): Promise<Response> {
  await authenticate(request, env, true);
  const submission = await env.DB.prepare(
    `SELECT s.id, s.person_id,
            (SELECT COUNT(*) FROM interests i WHERE i.submission_id = s.id) AS interest_count,
            (SELECT COUNT(*) FROM submission_replies r WHERE r.submission_id = s.id) AS reply_count
     FROM interest_submissions s WHERE s.id = ?1 LIMIT 1`,
  ).bind(submissionId).first<{
    id: string;
    person_id: string;
    interest_count: number;
    reply_count: number;
  }>();
  if (!submission) throw new AdminError(404, "SUBMISSION_NOT_FOUND", "This request was not found.");

  const interestCount = Number(submission.interest_count ?? 0);
  const replyCount = Number(submission.reply_count ?? 0);
  await env.DB.batch([
    env.DB.prepare("DELETE FROM submission_replies WHERE submission_id = ?1").bind(submissionId),
    env.DB.prepare("DELETE FROM interests WHERE submission_id = ?1").bind(submissionId),
    env.DB.prepare("DELETE FROM interest_submissions WHERE id = ?1").bind(submissionId),
    auditStatement(env, "interest_submission", submissionId, "deleted", {
      personId: submission.person_id,
      interestCount,
      replyCount,
    }),
  ]);
  return adminJson({
    success: true,
    submissionId,
    personId: submission.person_id,
    deletedInterests: interestCount,
    deletedReplies: replyCount,
  });
}

async function deleteRegistration(request: Request, env: AdminEnv, registrationId: string): Promise<Response> {
  await authenticate(request, env, true);
  const registration = await env.DB.prepare(
    "SELECT id, person_id, opportunity_id, status FROM trip_registrations WHERE id = ?1 LIMIT 1",
  ).bind(registrationId).first<{ id: string; person_id: string; opportunity_id: string; status: string }>();
  if (!registration) throw new AdminError(404, "REGISTRATION_NOT_FOUND", "This application record was not found.");
  await env.DB.batch([
    env.DB.prepare("DELETE FROM trip_registrations WHERE id = ?1").bind(registrationId),
    auditStatement(env, "trip_registration", registrationId, "deleted", {
      personId: registration.person_id,
      opportunityId: registration.opportunity_id,
      status: registration.status,
    }),
  ]);
  return adminJson({ success: true, registrationId, personId: registration.person_id });
}

async function deletePerson(request: Request, env: AdminEnv, personId: string): Promise<Response> {
  await authenticate(request, env, true);
  const person = await env.DB.prepare(
    `SELECT p.id,
            (SELECT COUNT(*) FROM interest_submissions s WHERE s.person_id = p.id) AS submission_count,
            (SELECT COUNT(*) FROM interests i WHERE i.person_id = p.id) AS interest_count,
            (SELECT COUNT(*) FROM submission_replies r
             JOIN interest_submissions s ON s.id = r.submission_id WHERE s.person_id = p.id) AS reply_count,
            (SELECT COUNT(*) FROM trip_registrations tr WHERE tr.person_id = p.id) AS registration_count,
            (SELECT COUNT(*) FROM team_members tm WHERE tm.person_id = p.id) AS team_count
     FROM people p WHERE p.id = ?1 LIMIT 1`,
  ).bind(personId).first<{
    id: string;
    submission_count: number;
    interest_count: number;
    reply_count: number;
    registration_count: number;
    team_count: number;
  }>();
  if (!person) throw new AdminError(404, "PERSON_NOT_FOUND", "This applicant was not found.");

  const deleted = {
    submissions: Number(person.submission_count ?? 0),
    interests: Number(person.interest_count ?? 0),
    replies: Number(person.reply_count ?? 0),
    registrations: Number(person.registration_count ?? 0),
    teamAssignments: Number(person.team_count ?? 0),
  };
  await env.DB.batch([
    env.DB.prepare("DELETE FROM team_members WHERE person_id = ?1").bind(personId),
    env.DB.prepare("DELETE FROM ministry_contacts WHERE person_id = ?1").bind(personId),
    env.DB.prepare("DELETE FROM contact_trips WHERE person_id = ?1").bind(personId),
    env.DB.prepare("DELETE FROM contact_areas WHERE person_id = ?1").bind(personId),
    env.DB.prepare("DELETE FROM contact_languages WHERE person_id = ?1").bind(personId),
    env.DB.prepare("DELETE FROM contact_types WHERE person_id = ?1").bind(personId),
    env.DB.prepare(
      "DELETE FROM submission_replies WHERE submission_id IN (SELECT id FROM interest_submissions WHERE person_id = ?1)",
    ).bind(personId),
    env.DB.prepare("DELETE FROM interests WHERE person_id = ?1").bind(personId),
    env.DB.prepare("DELETE FROM interest_submissions WHERE person_id = ?1").bind(personId),
    env.DB.prepare("DELETE FROM trip_registrations WHERE person_id = ?1").bind(personId),
    env.DB.prepare("DELETE FROM people WHERE id = ?1").bind(personId),
    auditStatement(env, "person", personId, "deleted", deleted),
  ]);
  return adminJson({ success: true, personId, deleted });
}

async function submissionDetail(request: Request, env: AdminEnv, submissionId: string): Promise<Response> {
  await authenticate(request, env);
  const submission = await env.DB.prepare(
    `SELECT s.id, s.person_id, s.preferred_timing, s.message, s.source_page, s.consent_at, s.created_at,
            p.first_name, p.last_name, p.email, p.phone, p.contact_preference, p.field_of_study
     FROM interest_submissions s JOIN people p ON p.id = s.person_id WHERE s.id = ?1`,
  ).bind(submissionId).first<Record<string, string | null>>();
  if (!submission) throw new AdminError(404, "SUBMISSION_NOT_FOUND", "This request was not found.");
  const interests = await env.DB.prepare(
    `SELECT i.id, i.status, i.created_at, i.updated_at, o.slug, o.title, o.kind, o.location, o.partner, o.duration,
            CASE WHEN i.submission_id = ?1 THEN 1 ELSE 0 END AS selected_in_submission
     FROM interests i JOIN opportunities o ON o.id = i.opportunity_id
     WHERE i.person_id = ?2 ORDER BY o.kind, o.sort_order`,
  ).bind(submissionId, submission.person_id).all<Record<string, string | number | null>>();
  const replies = await env.DB.prepare(
    `SELECT id, recipient_email, subject, body, delivery_method, delivery_status, provider_message_id,
            error_message, created_at, sent_at, updated_at
     FROM submission_replies WHERE submission_id = ?1 ORDER BY created_at DESC`,
  ).bind(submissionId).all<Record<string, string | null>>();
  return adminJson({
    submission: {
      id: submission.id,
      personId: submission.person_id,
      firstName: submission.first_name,
      lastName: submission.last_name,
      email: submission.email,
      phone: submission.phone,
      contactPreference: submission.contact_preference,
      fieldOfStudy: submission.field_of_study,
      preferredTiming: submission.preferred_timing,
      message: submission.message,
      sourcePage: submission.source_page,
      consentAt: submission.consent_at,
      createdAt: submission.created_at,
      interests: interests.results.map(row => ({
        id: row.id,
        status: row.status,
        slug: row.slug,
        title: row.title,
        kind: row.kind,
        location: row.location,
        partner: row.partner,
        duration: row.duration,
        selectedInSubmission: Boolean(row.selected_in_submission),
        createdAt: row.created_at,
        updatedAt: row.updated_at,
      })),
      replies: replies.results.map(row => ({
        id: row.id,
        recipientEmail: row.recipient_email,
        subject: row.subject,
        body: row.body,
        deliveryMethod: row.delivery_method,
        deliveryStatus: row.delivery_status,
        providerMessageId: row.provider_message_id,
        errorMessage: row.error_message,
        createdAt: row.created_at,
        sentAt: row.sent_at,
        updatedAt: row.updated_at,
      })),
    },
  });
}

async function updateInterestStatus(request: Request, env: AdminEnv, submissionId: string): Promise<Response> {
  await authenticate(request, env, true);
  const body = await readAdminJson(request);
  const status = typeof body.status === "string" ? body.status : "";
  const interestId = cleanLine(body.interestId, 80);
  if (!ALLOWED_STATUSES.has(status)) throw new AdminError(422, "INVALID_STATUS", "Choose a valid follow-up status.");
  if (!interestId) throw new AdminError(422, "INVALID_INTEREST", "Choose an interest to update.");
  const now = new Date().toISOString();
  const result = await env.DB.prepare(
    `UPDATE interests SET status = ?1, updated_at = ?2
     WHERE id = ?3 AND person_id = (SELECT person_id FROM interest_submissions WHERE id = ?4)`,
  ).bind(status, now, interestId, submissionId).run();
  if (Number(result.meta.changes ?? 0) !== 1) throw new AdminError(404, "INTEREST_NOT_FOUND", "This interest was not found.");
  await audit(env, "interest", interestId, "status_changed", { submissionId, status });
  return adminJson({ success: true, interestId, status, updatedAt: now });
}

function mailtoUrl(email: string, subject: string, body: string): string {
  return `mailto:${encodeURIComponent(email)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}

async function createReply(request: Request, env: AdminEnv, submissionId: string): Promise<Response> {
  await authenticate(request, env, true);
  const body = await readAdminJson(request);
  const subject = cleanLine(body.subject, 160);
  const message = cleanMessage(body.message, 3000);
  if (!subject || !message) throw new AdminError(422, "INVALID_REPLY", "Add a subject and a message before opening the email.");
  const recipient = await env.DB.prepare(
    `SELECT p.email FROM interest_submissions s JOIN people p ON p.id = s.person_id WHERE s.id = ?1`,
  ).bind(submissionId).first<{ email: string }>();
  if (!recipient) throw new AdminError(404, "SUBMISSION_NOT_FOUND", "This request was not found.");
  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  await env.DB.prepare(
    `INSERT INTO submission_replies (
       id, submission_id, recipient_email, subject, body, delivery_method, delivery_status, created_at, updated_at
     ) VALUES (?1, ?2, ?3, ?4, ?5, 'email_client', 'draft', ?6, ?7)`,
  ).bind(id, submissionId, recipient.email, subject, message, now, now).run();
  await audit(env, "submission_reply", id, "email_client_opened", { submissionId });
  return adminJson({
    success: true,
    reply: {
      id,
      recipientEmail: recipient.email,
      subject,
      body: message,
      deliveryMethod: "email_client",
      deliveryStatus: "draft",
      createdAt: now,
    },
    mailtoUrl: mailtoUrl(recipient.email, subject, message),
    message: "The reply was saved. Your email app can send it now.",
  }, 201);
}

async function markReplySent(request: Request, env: AdminEnv, replyId: string): Promise<Response> {
  await authenticate(request, env, true);
  const now = new Date().toISOString();
  const result = await env.DB.prepare(
    `UPDATE submission_replies SET delivery_status = 'sent', sent_at = COALESCE(sent_at, ?1), updated_at = ?2
     WHERE id = ?3 AND delivery_method = 'email_client'`,
  ).bind(now, now, replyId).run();
  if (Number(result.meta.changes ?? 0) !== 1) throw new AdminError(404, "REPLY_NOT_FOUND", "This saved reply was not found.");
  await audit(env, "submission_reply", replyId, "marked_sent");
  return adminJson({ success: true, replyId, deliveryStatus: "sent", sentAt: now });
}

async function readContactImportUpload(request: Request): Promise<{ fileName: string; fileSize: number; bytes: Uint8Array }> {
  const contentType = request.headers.get("content-type") ?? "";
  if (!contentType.toLocaleLowerCase("en-US").startsWith("multipart/form-data;")) {
    throw new AdminError(415, "UNSUPPORTED_MEDIA_TYPE", "Upload the spreadsheet from the import form.");
  }
  const declaredLength = Number(request.headers.get("content-length") ?? 0);
  if (Number.isFinite(declaredLength) && declaredLength > CONTACT_IMPORT_REQUEST_LIMIT) {
    throw new AdminError(413, "REQUEST_TOO_LARGE", "Choose a spreadsheet smaller than 2 MB.");
  }

  const reader = request.body?.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  if (reader) {
    while (true) {
      const next = await reader.read();
      if (next.done) break;
      total += next.value.byteLength;
      if (total > CONTACT_IMPORT_REQUEST_LIMIT) {
        await reader.cancel();
        throw new AdminError(413, "REQUEST_TOO_LARGE", "Choose a spreadsheet smaller than 2 MB.");
      }
      chunks.push(next.value);
    }
  }
  const body = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }
  let formData: FormData;
  try {
    formData = await new Response(body, { headers: { "Content-Type": contentType } }).formData();
  } catch {
    throw new AdminError(400, "INVALID_UPLOAD", "The spreadsheet upload could not be read.");
  }
  const uploaded = formData.get("file");
  if (!(uploaded instanceof File)) throw new AdminError(422, "FILE_REQUIRED", "Choose an Excel or CSV spreadsheet to import.");
  if (uploaded.size > CONTACT_IMPORT_MAX_FILE_BYTES) throw new AdminError(413, "REQUEST_TOO_LARGE", "Choose a spreadsheet smaller than 2 MB.");
  const fileName = uploaded.name.normalize("NFKC").replace(/[\\/]+/g, "-").replace(/[\u0000-\u001F\u007F]/g, "").trim().slice(0, 180);
  if (!fileName) throw new AdminError(422, "INVALID_FILE_NAME", "Choose a spreadsheet with a valid file name.");
  return { fileName, fileSize: uploaded.size, bytes: new Uint8Array(await uploaded.arrayBuffer()) };
}

function chunkValues<T>(values: T[], size = 50): T[][] {
  const chunks: T[][] = [];
  for (let index = 0; index < values.length; index += size) chunks.push(values.slice(index, index + size));
  return chunks;
}

const IMPORT_PERSON_COLUMNS = `
  id, first_name, last_name, first_name_normalized, last_name_normalized,
  preferred_name, email, email_normalized, phone, phone_normalized, contact_preference,
  field_of_study, address_line_1, address_line_2, city, region, postal_code, country,
  organization, website, notes, contact_status, last_contacted_at`;

async function findImportPeople(env: AdminEnv, inputs: ContactImportInput[]): Promise<ImportPersonRow[]> {
  const ids = [...new Set(inputs.map(input => input.contactId).filter((value): value is string => Boolean(value)))];
  const emails = [...new Set(inputs.map(input => input.email ? normalizeImportEmail(input.email) : "").filter(Boolean))];
  const phones = [...new Set(inputs.map(input => normalizeImportPhone(input.phone)).filter((value): value is string => Boolean(value)))];
  const queries: Promise<D1Result<ImportPersonRow>>[] = [];
  for (const values of chunkValues(ids)) {
    queries.push(env.DB.prepare(`SELECT ${IMPORT_PERSON_COLUMNS} FROM people WHERE id IN (${values.map(() => "?").join(", ")})`).bind(...values).all<ImportPersonRow>());
  }
  for (const values of chunkValues(emails)) {
    queries.push(env.DB.prepare(`SELECT ${IMPORT_PERSON_COLUMNS} FROM people WHERE email_normalized IN (${values.map(() => "?").join(", ")})`).bind(...values).all<ImportPersonRow>());
  }
  for (const values of chunkValues(phones)) {
    queries.push(env.DB.prepare(`SELECT ${IMPORT_PERSON_COLUMNS} FROM people WHERE phone_normalized IN (${values.map(() => "?").join(", ")})`).bind(...values).all<ImportPersonRow>());
  }
  const unique = new Map<string, ImportPersonRow>();
  for (const result of await Promise.all(queries)) {
    for (const person of result.results) unique.set(person.id, person);
  }
  return [...unique.values()];
}

function importEmailKey(input: Pick<ContactImportInput, "email" | "firstName" | "lastName">): string | null {
  return input.email
    ? `${normalizeImportEmail(input.email)}\u0000${normalizeImportName(input.firstName)}\u0000${normalizeImportName(input.lastName)}`
    : null;
}

function importPhoneKey(input: Pick<ContactImportInput, "phone" | "firstName" | "lastName">): string | null {
  const phone = normalizeImportPhone(input.phone);
  return phone ? `${phone}\u0000${normalizeImportName(input.firstName)}\u0000${normalizeImportName(input.lastName)}` : null;
}

function personEmailKey(person: ImportPersonRow): string | null {
  return person.email_normalized
    ? `${person.email_normalized}\u0000${person.first_name_normalized}\u0000${person.last_name_normalized}`
    : null;
}

function personPhoneKey(person: ImportPersonRow): string | null {
  return person.phone_normalized
    ? `${person.phone_normalized}\u0000${person.first_name_normalized}\u0000${person.last_name_normalized}`
    : null;
}

function indexImportPeople(people: ImportPersonRow[], key: (person: ImportPersonRow) => string | null): Map<string, ImportPersonRow | null> {
  const result = new Map<string, ImportPersonRow | null>();
  for (const person of people) {
    const value = key(person);
    if (!value) continue;
    const existing = result.get(value);
    result.set(value, existing && existing.id !== person.id ? null : person);
  }
  return result;
}

async function analyzeContactImport(env: AdminEnv, parsedRows: ReturnType<typeof parseContactImportFile>["rows"]): Promise<ImportRowAnalysis[]> {
  const opportunitiesResult = await env.DB.prepare(
    "SELECT id, slug, title, location FROM opportunities WHERE kind = 'trip' AND active = 1 ORDER BY sort_order",
  ).all<ContactImportOpportunity>();
  const validated = parsedRows.map(row => validateContactImportRow(row, opportunitiesResult.results));
  const inputs = validated.map(row => row.input).filter((input): input is ContactImportInput => Boolean(input));
  const people = await findImportPeople(env, inputs);
  const byId = new Map(people.map(person => [person.id, person]));
  const byEmail = indexImportPeople(people, personEmailKey);
  const byPhone = indexImportPeople(people, personPhoneKey);
  const seenUploadKeys = new Set<string>();
  const seenExistingIds = new Set<string>();

  return validated.map((row, index) => {
    const errors = [...row.errors];
    const warnings = [...row.warnings];
    const input = row.input;
    let existing: ImportPersonRow | null = null;
    let matchedBy: string | null = null;
    if (input) {
      const emailKey = importEmailKey(input);
      const phoneKey = importPhoneKey(input);
      const uploadKeys = [input.contactId ? `id:${input.contactId}` : null, emailKey ? `email:${emailKey}` : null, phoneKey ? `phone:${phoneKey}` : null].filter((value): value is string => Boolean(value));
      if (uploadKeys.some(key => seenUploadKeys.has(key))) errors.push("This person appears more than once in the uploaded spreadsheet.");
      uploadKeys.forEach(key => seenUploadKeys.add(key));

      const idMatch = input.contactId ? byId.get(input.contactId) : undefined;
      const emailMatch = emailKey ? byEmail.get(emailKey) : undefined;
      const phoneMatch = phoneKey ? byPhone.get(phoneKey) : undefined;
      if (input.contactId && !idMatch) errors.push("Contact ID was not found. Clear it if this should be a new contact.");
      if (emailKey && emailMatch === null) errors.push("More than one existing contact matches this email and name.");
      if (phoneKey && phoneMatch === null) errors.push("More than one existing contact matches this phone number and name.");
      const matches = [idMatch, emailMatch, phoneMatch].filter((person): person is ImportPersonRow => Boolean(person));
      if (new Set(matches.map(person => person.id)).size > 1) errors.push("The Contact ID, email, and phone point to different existing contacts.");
      existing = matches[0] ?? null;
      if (existing) {
        matchedBy = idMatch ? "Contact ID" : emailMatch ? "email and name" : "phone and name";
        if (seenExistingIds.has(existing.id)) errors.push("This existing contact is matched by more than one spreadsheet row.");
        seenExistingIds.add(existing.id);
      }
    }
    const source = parsedRows[index];
    const displayName = input
      ? `${input.firstName} ${input.lastName}`.trim()
      : `${source.values.firstName} ${source.values.lastName}`.trim() || "Row needs correction";
    return {
      rowNumber: row.rowNumber,
      name: displayName,
      email: input?.email ?? source.values.email,
      phone: input?.phone ?? (source.values.phone || null),
      action: errors.length ? "error" : existing ? "update" : "create",
      existingPersonId: existing?.id ?? null,
      matchedBy,
      errors: [...new Set(errors)],
      warnings: [...new Set(warnings)],
      input: errors.length ? null : input,
      existing,
    };
  });
}

function publicImportResult(
  file: { fileName: string; fileSize: number },
  parsed: ReturnType<typeof parseContactImportFile>,
  rows: ImportRowAnalysis[],
): Record<string, unknown> {
  const creates = rows.filter(row => row.action === "create").length;
  const updates = rows.filter(row => row.action === "update").length;
  const errors = rows.filter(row => row.action === "error").length;
  return {
    fileName: file.fileName,
    fileSize: file.fileSize,
    fileType: parsed.fileType,
    sheetName: parsed.sheetName,
    headerRowNumber: parsed.headerRowNumber,
    totalRows: rows.length,
    creates,
    updates,
    errors,
    canImport: creates + updates > 0,
    rows: rows.map(({ input: _input, existing: _existing, ...row }) => row),
  };
}

async function prepareContactImport(request: Request, env: AdminEnv): Promise<{
  file: { fileName: string; fileSize: number; bytes: Uint8Array };
  parsed: ReturnType<typeof parseContactImportFile>;
  rows: ImportRowAnalysis[];
}> {
  await authenticate(request, env, true);
  const file = await readContactImportUpload(request);
  const parsed = parseContactImportFile(file.fileName, file.bytes);
  if (!parsed.rows.length) throw new AdminError(422, "NO_CONTACT_ROWS", "No contact rows were found below the spreadsheet headers.");
  const rows = await analyzeContactImport(env, parsed.rows);
  return { file, parsed, rows };
}

async function previewContactImport(request: Request, env: AdminEnv): Promise<Response> {
  const { file, parsed, rows } = await prepareContactImport(request, env);
  return adminJson({ preview: publicImportResult(file, parsed, rows) });
}

function mergedImportNotes(existing: string | null, incoming: string | null, now: string): string | null {
  if (!incoming) return existing;
  if (!existing) return incoming;
  if (existing.includes(incoming)) return existing;
  return `${existing}\n\nImported ${now.slice(0, 10)}: ${incoming}`;
}

function mergeContactImportInput(input: ContactImportInput, existing: ImportPersonRow | null, now: string): ContactInput {
  const email = input.email || existing?.email || "";
  const phone = input.phone || existing?.phone || null;
  let contactPreference = input.contactPreference ?? existing?.contact_preference ?? (email ? "email" : "phone");
  if (contactPreference === "email" && !email) contactPreference = "phone";
  if (contactPreference === "phone" && !phone) contactPreference = "email";
  return {
    firstName: input.firstName,
    lastName: input.lastName,
    preferredName: input.preferredName ?? existing?.preferred_name ?? null,
    email,
    phone,
    contactPreference,
    fieldOfStudy: input.fieldOfStudy ?? existing?.field_of_study ?? null,
    addressLine1: input.addressLine1 ?? existing?.address_line_1 ?? null,
    addressLine2: input.addressLine2 ?? existing?.address_line_2 ?? null,
    city: input.city ?? existing?.city ?? null,
    region: input.region ?? existing?.region ?? null,
    postalCode: input.postalCode ?? existing?.postal_code ?? null,
    country: input.country ?? existing?.country ?? null,
    organization: input.organization ?? existing?.organization ?? null,
    website: input.website ?? existing?.website ?? null,
    notes: mergedImportNotes(existing?.notes ?? null, input.notes, now),
    contactStatus: input.contactStatus ?? existing?.contact_status ?? "active",
    lastContactedAt: input.lastContactedAt ?? existing?.last_contacted_at ?? null,
    contactTypes: input.contactTypes.length ? input.contactTypes : existing ? [] : ["other"],
    areas: input.areas,
    languages: input.languages,
    tripIds: input.tripIds,
  };
}

function importRelationStatements(env: AdminEnv, personId: string, input: ContactInput, now: string): D1PreparedStatement[] {
  return [
    ...input.contactTypes.map(contactType => env.DB.prepare(
      "INSERT OR IGNORE INTO contact_types (person_id, contact_type, created_at) VALUES (?1, ?2, ?3)",
    ).bind(personId, contactType, now)),
    ...input.languages.map(language => env.DB.prepare(
      `INSERT OR IGNORE INTO contact_languages (person_id, language, language_normalized, created_at)
       VALUES (?1, ?2, ?3, ?4)`,
    ).bind(personId, language, normalizeTeamName(language), now)),
    ...input.areas.map(area => env.DB.prepare(
      "INSERT OR IGNORE INTO contact_areas (person_id, area, created_at) VALUES (?1, ?2, ?3)",
    ).bind(personId, area, now)),
    ...input.tripIds.map(tripId => env.DB.prepare(
      "INSERT OR IGNORE INTO contact_trips (person_id, opportunity_id, created_at) VALUES (?1, ?2, ?3)",
    ).bind(personId, tripId, now)),
  ];
}

function contactImportWrite(
  env: AdminEnv,
  row: ImportRowAnalysis,
  importId: string,
  fileName: string,
  now: string,
): { row: ImportRowAnalysis; personId: string; statements: D1PreparedStatement[] } {
  if (!row.input || row.action === "error") throw new Error("Cannot write an invalid import row");
  const personId = row.existing?.id ?? crypto.randomUUID();
  const input = mergeContactImportInput(row.input, row.existing, now);
  const emailNormalized = normalizeImportEmail(input.email);
  const phoneNormalized = normalizeImportPhone(input.phone);
  const core = row.action === "create"
    ? env.DB.prepare(
      `INSERT INTO people (
         id, first_name, last_name, first_name_normalized, last_name_normalized,
         email, email_normalized, phone, phone_normalized, contact_preference, field_of_study,
         preferred_name, address_line_1, address_line_2, city, region, postal_code, country,
         organization, website, notes, record_source, contact_status, last_contacted_at,
         created_at, updated_at
       ) VALUES (
         ?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13,
         ?14, ?15, ?16, ?17, ?18, ?19, ?20, ?21, 'manual', ?22, ?23, ?24, ?25
       )`,
    ).bind(
      personId, input.firstName, input.lastName, normalizeImportName(input.firstName), normalizeImportName(input.lastName),
      input.email, emailNormalized, input.phone, phoneNormalized, input.contactPreference, input.fieldOfStudy,
      input.preferredName, input.addressLine1, input.addressLine2, input.city, input.region, input.postalCode,
      input.country, input.organization, input.website, input.notes, input.contactStatus, input.lastContactedAt,
      now, now,
    )
    : env.DB.prepare(
      `UPDATE people SET
         first_name = ?1, last_name = ?2, first_name_normalized = ?3, last_name_normalized = ?4,
         email = ?5, email_normalized = ?6, phone = ?7, phone_normalized = ?8,
         contact_preference = ?9, field_of_study = ?10, preferred_name = ?11,
         address_line_1 = ?12, address_line_2 = ?13, city = ?14, region = ?15,
         postal_code = ?16, country = ?17, organization = ?18, website = ?19, notes = ?20,
         contact_status = ?21, last_contacted_at = ?22, updated_at = ?23
       WHERE id = ?24`,
    ).bind(
      input.firstName, input.lastName, normalizeImportName(input.firstName), normalizeImportName(input.lastName),
      input.email, emailNormalized, input.phone, phoneNormalized, input.contactPreference, input.fieldOfStudy,
      input.preferredName, input.addressLine1, input.addressLine2, input.city, input.region, input.postalCode,
      input.country, input.organization, input.website, input.notes, input.contactStatus, input.lastContactedAt,
      now, personId,
    );
  return {
    row,
    personId,
    statements: [
      core,
      ...importRelationStatements(env, personId, input, now),
      auditStatement(env, "person", personId, row.action === "create" ? "contact_import_created" : "contact_import_updated", {
        importId,
        fileName,
        rowNumber: row.rowNumber,
      }),
    ],
  };
}

function groupImportWrites<T extends { statements: D1PreparedStatement[] }>(writes: T[], statementLimit = 80): T[][] {
  const batches: T[][] = [];
  let batch: T[] = [];
  let count = 0;
  for (const write of writes) {
    if (batch.length && count + write.statements.length > statementLimit) {
      batches.push(batch);
      batch = [];
      count = 0;
    }
    batch.push(write);
    count += write.statements.length;
  }
  if (batch.length) batches.push(batch);
  return batches;
}

async function commitContactImport(request: Request, env: AdminEnv): Promise<Response> {
  const { file, parsed, rows } = await prepareContactImport(request, env);
  const importId = crypto.randomUUID();
  const now = new Date().toISOString();
  const writes = rows.filter(row => row.action !== "error").map(row => contactImportWrite(env, row, importId, file.fileName, now));
  if (!writes.length) throw new AdminError(422, "NO_VALID_ROWS", "Correct at least one spreadsheet row before importing.");

  const succeeded = new Set<number>();
  const failed = new Map<number, string>();
  for (const batch of groupImportWrites(writes)) {
    try {
      await env.DB.batch(batch.flatMap(write => write.statements));
      batch.forEach(write => succeeded.add(write.row.rowNumber));
    } catch (batchError) {
      console.warn(JSON.stringify({ event: "contact_import_batch_retry", importId, rows: batch.length }));
      for (const write of batch) {
        try {
          await env.DB.batch(write.statements);
          succeeded.add(write.row.rowNumber);
        } catch (rowError) {
          console.error(JSON.stringify({
            event: "contact_import_row_failed",
            importId,
            rowNumber: write.row.rowNumber,
            message: rowError instanceof Error ? rowError.message : "Unknown error",
          }));
          failed.set(write.row.rowNumber, "The database could not import this row. Check for a conflicting existing contact.");
        }
      }
    }
  }

  const completedRows = rows.map(row => failed.has(row.rowNumber)
    ? { ...row, action: "error" as const, errors: [...row.errors, failed.get(row.rowNumber) as string], input: null }
    : row);
  const createdCount = completedRows.filter(row => row.action === "create" && succeeded.has(row.rowNumber)).length;
  const updatedCount = completedRows.filter(row => row.action === "update" && succeeded.has(row.rowNumber)).length;
  const errorCount = completedRows.filter(row => row.action === "error").length;
  await env.DB.batch([
    env.DB.prepare(
      `INSERT INTO contact_imports (
         id, file_name, file_size, file_type, total_rows, created_count, updated_count, error_count, imported_at
       ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)`,
    ).bind(importId, file.fileName, file.fileSize, parsed.fileType, rows.length, createdCount, updatedCount, errorCount, now),
    auditStatement(env, "contact_import", importId, "completed", {
      fileName: file.fileName,
      totalRows: rows.length,
      createdCount,
      updatedCount,
      errorCount,
    }),
  ]);

  return adminJson({
    import: {
      ...publicImportResult(file, parsed, completedRows),
      importId,
      importedAt: now,
      created: createdCount,
      updated: updatedCount,
      errors: errorCount,
    },
  }, 201);
}

export function csvCell(value: unknown): string {
  let text = value === null || value === undefined ? "" : String(value);
  if (/^[\u0009\u0020]*[=+\-@]/.test(text)) text = `'${text}`;
  return `"${text.replace(/"/g, '""')}"`;
}

async function exportCsv(request: Request, env: AdminEnv): Promise<Response> {
  await authenticate(request, env);
  const url = new URL(request.url);
  const filters = adminFilters(url);
  const scope = url.searchParams.get("view") === "people" ? "person" : "submission";
  const { whereSql, bindings } = filterSql(filters, scope);
  if (scope === "person") {
    const rows = await env.DB.prepare(
      `SELECT p.id AS contact_id, p.first_name, p.preferred_name, p.last_name, p.email, p.phone,
              p.contact_preference, p.organization, p.website, p.field_of_study,
              p.address_line_1, p.address_line_2, p.city, p.region, p.postal_code, p.country,
              p.contact_status, p.record_source, p.last_contacted_at, p.notes,
              COALESCE((SELECT group_concat(selected.contact_type, '; ') FROM (
                SELECT ct.contact_type FROM contact_types ct WHERE ct.person_id = p.id ORDER BY ct.contact_type
              ) selected), '') AS contact_types,
              COALESCE((SELECT group_concat(selected.language, '; ') FROM (
                SELECT cl.language FROM contact_languages cl WHERE cl.person_id = p.id ORDER BY cl.language_normalized
              ) selected), '') AS languages,
              COALESCE((SELECT group_concat(selected.area, '; ') FROM (
                SELECT ca.area FROM contact_areas ca WHERE ca.person_id = p.id ORDER BY ca.area
              ) selected), '') AS hope_sojourns_areas,
              COALESCE((SELECT group_concat(selected.title, '; ') FROM (
                SELECT o.title FROM contact_trips ct JOIN opportunities o ON o.id = ct.opportunity_id
                WHERE ct.person_id = p.id ORDER BY o.sort_order
              ) selected), '') AS trips,
              COALESCE((SELECT group_concat(selected.name, '; ') FROM (
                SELECT t.name FROM team_members tm JOIN teams t ON t.id = tm.team_id
                WHERE tm.person_id = p.id ORDER BY t.name_normalized
              ) selected), '') AS teams,
              COALESCE((SELECT group_concat(selected.name, '; ') FROM (
                SELECT m.name FROM ministry_contacts mc JOIN ministries m ON m.id = mc.ministry_id
                WHERE mc.person_id = p.id ORDER BY m.name_normalized
              ) selected), '') AS ministries,
              p.created_at, p.updated_at
       FROM people p ${whereSql}
       ORDER BY p.last_name_normalized, p.first_name_normalized`,
    ).bind(...bindings).all<Record<string, unknown>>();
    const columns = [
      "contact_id", "first_name", "preferred_name", "last_name", "email", "phone", "contact_preference",
      "organization", "website", "field_of_study", "address_line_1", "address_line_2", "city", "region",
      "postal_code", "country", "contact_status", "record_source", "last_contacted_at", "contact_types",
      "languages", "hope_sojourns_areas", "trips", "teams", "ministries", "notes", "created_at", "updated_at",
    ];
    const csv = [columns.map(csvCell).join(","), ...rows.results.map(row => columns.map(column => csvCell(row[column])).join(","))].join("\r\n");
    await audit(env, "person", "all", "csv_exported", { rowCount: rows.results.length });
    const headers = securityHeaders();
    headers.set("Content-Type", "text/csv; charset=utf-8");
    headers.set("Content-Disposition", `attachment; filename="hope-sojourns-contacts-${new Date().toISOString().slice(0, 10)}.csv"`);
    return new Response(`\uFEFF${csv}`, { status: 200, headers });
  }
  const rows = await env.DB.prepare(
    `SELECT s.id AS submission_id, s.created_at AS submitted_at,
            p.first_name, p.last_name, p.email, p.phone, p.contact_preference, p.field_of_study,
            COALESCE((
              SELECT group_concat(selected_team.name, '; ')
              FROM (
                SELECT t.name FROM team_members tm JOIN teams t ON t.id = tm.team_id
                WHERE tm.person_id = p.id ORDER BY t.name_normalized
              ) selected_team
            ), '') AS teams,
            s.preferred_timing, s.message,
            o.kind, o.title AS opportunity, o.location, o.partner, o.duration, i.status,
            (SELECT r.subject FROM submission_replies r WHERE r.submission_id = s.id ORDER BY r.created_at DESC LIMIT 1) AS last_reply_subject,
            (SELECT r.delivery_status FROM submission_replies r WHERE r.submission_id = s.id ORDER BY r.created_at DESC LIMIT 1) AS last_reply_status,
            (SELECT COALESCE(r.sent_at, r.created_at) FROM submission_replies r WHERE r.submission_id = s.id ORDER BY r.created_at DESC LIMIT 1) AS last_reply_at
     FROM interest_submissions s
     JOIN people p ON p.id = s.person_id
     JOIN json_each(s.selected_opportunities_json) selected_opportunity
     JOIN opportunities o ON o.slug = selected_opportunity.value
     LEFT JOIN interests i ON i.person_id = s.person_id AND i.opportunity_id = o.id
     ${whereSql}
     ORDER BY s.created_at DESC, o.sort_order`,
  ).bind(...bindings).all<Record<string, unknown>>();
  const columns = [
    "submission_id", "submitted_at", "first_name", "last_name", "email", "phone", "contact_preference",
    "field_of_study", "teams", "preferred_timing", "message", "kind", "opportunity", "location", "partner", "duration",
    "status", "last_reply_subject", "last_reply_status", "last_reply_at",
  ];
  const csv = [columns.map(csvCell).join(","), ...rows.results.map(row => columns.map(column => csvCell(row[column])).join(","))].join("\r\n");
  await audit(env, "interest_submission", "all", "csv_exported", { rowCount: rows.results.length });
  const date = new Date().toISOString().slice(0, 10);
  const headers = securityHeaders();
  headers.set("Content-Type", "text/csv; charset=utf-8");
  headers.set("Content-Disposition", `attachment; filename="hope-sojourns-interest-${date}.csv"`);
  return new Response(`\uFEFF${csv}`, { status: 200, headers });
}

async function routeAdmin(request: Request, env: AdminEnv, path: string): Promise<Response> {
  if (request.method === "POST" && path === "/admin/login") return login(request, env);
  if (request.method === "GET" && path === "/admin/session") return sessionInfo(request, env);
  if (request.method === "POST" && path === "/admin/logout") return logout(request, env);
  if (request.method === "POST" && path === "/admin/password") return changePassword(request, env);
  if (request.method === "GET" && path === "/admin/teams") return listTeams(request, env);
  if (request.method === "POST" && path === "/admin/teams") return createTeam(request, env);
  if (request.method === "GET" && path === "/admin/people") return listPeople(request, env);
  if (request.method === "POST" && path === "/admin/people") return createContact(request, env);
  if (request.method === "POST" && path === "/admin/contact-imports/preview") return previewContactImport(request, env);
  if (request.method === "POST" && path === "/admin/contact-imports") return commitContactImport(request, env);
  if (request.method === "GET" && path === "/admin/ministries") return listMinistries(request, env);
  if (request.method === "POST" && path === "/admin/ministries") return createMinistry(request, env);
  if (request.method === "GET" && path === "/admin/submissions") return listSubmissions(request, env);
  if (request.method === "GET" && path === "/admin/export.csv") return exportCsv(request, env);

  const personTeamsMatch = path.match(/^\/admin\/people\/([0-9a-f-]{36})\/teams$/i);
  if (request.method === "POST" && personTeamsMatch) return setPersonTeams(request, env, personTeamsMatch[1]);
  const personMatch = path.match(/^\/admin\/people\/([0-9a-f-]{36})$/i);
  if (request.method === "GET" && personMatch) return personDetail(request, env, personMatch[1]);
  if (request.method === "PUT" && personMatch) return updateContact(request, env, personMatch[1]);
  if (request.method === "DELETE" && personMatch) return deletePerson(request, env, personMatch[1]);
  const ministryContactMatch = path.match(/^\/admin\/ministries\/([0-9a-f-]{36})\/contacts$/i);
  if (request.method === "POST" && ministryContactMatch) return addMinistryContact(request, env, ministryContactMatch[1]);
  const ministryContactRemoveMatch = path.match(/^\/admin\/ministries\/([0-9a-f-]{36})\/contacts\/remove$/i);
  if (request.method === "POST" && ministryContactRemoveMatch) return removeMinistryContact(request, env, ministryContactRemoveMatch[1]);
  const ministryMatch = path.match(/^\/admin\/ministries\/([0-9a-f-]{36})$/i);
  if (request.method === "GET" && ministryMatch) return ministryDetail(request, env, ministryMatch[1]);
  if (request.method === "PUT" && ministryMatch) return updateMinistry(request, env, ministryMatch[1]);
  if (request.method === "DELETE" && ministryMatch) return deleteMinistry(request, env, ministryMatch[1]);
  const teamMemberMatch = path.match(/^\/admin\/teams\/([0-9a-f-]{36})\/members$/i);
  if (request.method === "POST" && teamMemberMatch) return addTeamMember(request, env, teamMemberMatch[1]);
  const teamMemberRemoveMatch = path.match(/^\/admin\/teams\/([0-9a-f-]{36})\/members\/remove$/i);
  if (request.method === "POST" && teamMemberRemoveMatch) return removeTeamMember(request, env, teamMemberRemoveMatch[1]);
  const teamMatch = path.match(/^\/admin\/teams\/([0-9a-f-]{36})$/i);
  if (request.method === "GET" && teamMatch) return teamDetail(request, env, teamMatch[1]);
  if (request.method === "DELETE" && teamMatch) return deleteTeam(request, env, teamMatch[1]);
  const detailMatch = path.match(/^\/admin\/submissions\/([0-9a-f-]{36})$/i);
  if (request.method === "GET" && detailMatch) return submissionDetail(request, env, detailMatch[1]);
  if (request.method === "DELETE" && detailMatch) return deleteSubmission(request, env, detailMatch[1]);
  const statusMatch = path.match(/^\/admin\/submissions\/([0-9a-f-]{36})\/status$/i);
  if (request.method === "POST" && statusMatch) return updateInterestStatus(request, env, statusMatch[1]);
  const replyMatch = path.match(/^\/admin\/submissions\/([0-9a-f-]{36})\/replies$/i);
  if (request.method === "POST" && replyMatch) return createReply(request, env, replyMatch[1]);
  const sentMatch = path.match(/^\/admin\/replies\/([0-9a-f-]{36})\/sent$/i);
  if (request.method === "POST" && sentMatch) return markReplySent(request, env, sentMatch[1]);
  const registrationMatch = path.match(/^\/admin\/registrations\/([0-9a-f-]{36})$/i);
  if (request.method === "DELETE" && registrationMatch) return deleteRegistration(request, env, registrationMatch[1]);
  throw new AdminError(404, "NOT_FOUND", "Not found.");
}

export async function handleAdminRequest(request: Request, env: AdminEnv, path: string): Promise<Response> {
  try {
    return await routeAdmin(request, env, path);
  } catch (error) {
    if (error instanceof ContactImportFileError) {
      return adminJson({ error: error.message, code: error.code }, error.status);
    }
    if (error instanceof AdminError) {
      if (error.status >= 500) console.error(JSON.stringify({ event: "admin_request_failed", code: error.code, status: error.status }));
      return adminJson({ error: error.message, code: error.code }, error.status, error.headers);
    }
    console.error(JSON.stringify({ event: "admin_unhandled_error", message: error instanceof Error ? error.message : "Unknown error" }));
    return adminJson({ error: "The Admin Portal encountered an unexpected error.", code: "SERVER_ERROR" }, 500);
  }
}
