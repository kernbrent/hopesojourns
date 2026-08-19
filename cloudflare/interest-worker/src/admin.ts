const ADMIN_BODY_LIMIT = 48 * 1024;
const SESSION_HOURS = 8;
const LOGIN_WINDOW_MINUTES = 15;
const LOGIN_FAILURE_LIMIT = 5;
const ALLOWED_STATUSES = new Set(["new", "contacted", "exploring", "closed"]);

type AdminEnv = Env & {
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

class AdminError extends Error {
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

function adminJson(body: unknown, status = 200, extraHeaders?: HeadersInit): Response {
  const headers = securityHeaders();
  headers.set("Content-Type", "application/json; charset=utf-8");
  if (extraHeaders) new Headers(extraHeaders).forEach((value, key) => headers.append(key, value));
  return Response.json(body, { status, headers });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

async function readAdminJson(request: Request): Promise<Record<string, unknown>> {
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
  const [leftHash, rightHash] = await Promise.all([hashText(left), hashText(right)]);
  let difference = 0;
  for (let index = 0; index < leftHash.length; index += 1) {
    difference |= leftHash.charCodeAt(index) ^ rightHash.charCodeAt(index);
  }
  return difference === 0;
}

function requireSecrets(env: AdminEnv): { password: string; sessionSecret: string } {
  if (!env.ADMIN_PASSWORD || !env.ADMIN_SESSION_SECRET) {
    throw new AdminError(503, "ADMIN_NOT_CONFIGURED", "The Admin Portal is not configured yet.");
  }
  return { password: env.ADMIN_PASSWORD, sessionSecret: env.ADMIN_SESSION_SECRET };
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

function sessionCookie(token: string, maxAgeSeconds: number): string {
  return `hs_admin_session=${token}; Path=/api/interest/admin; Max-Age=${maxAgeSeconds}; HttpOnly; Secure; SameSite=Strict`;
}

async function authenticate(request: Request, env: AdminEnv, requireCsrf = false): Promise<AdminSessionRow> {
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

async function audit(env: AdminEnv, entityType: string, entityId: string, eventType: string, metadata?: unknown): Promise<void> {
  await env.DB.prepare(
    `INSERT INTO audit_events (id, entity_type, entity_id, event_type, metadata_json, created_at)
     VALUES (?1, ?2, ?3, ?4, ?5, ?6)`,
  ).bind(
    crypto.randomUUID(), entityType, entityId, eventType,
    metadata === undefined ? null : JSON.stringify(metadata), new Date().toISOString(),
  ).run();
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
  const { password: expectedPassword, sessionSecret } = requireSecrets(env);
  const body = await readAdminJson(request);
  const submittedPassword = typeof body.password === "string" ? body.password : "";
  const keyHash = await loginKey(request, sessionSecret);
  const currentAttempt = await checkLoginBlock(env, keyHash);
  if (!submittedPassword || !(await secureEqual(submittedPassword, expectedPassword))) {
    await recordLoginFailure(env, keyHash, currentAttempt);
    console.warn(JSON.stringify({ event: "admin_login_failed" }));
    throw new AdminError(401, "INVALID_CREDENTIALS", "The password is incorrect.");
  }

  const now = new Date();
  const expiresAt = new Date(now.getTime() + SESSION_HOURS * 60 * 60_000);
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
  await audit(env, "admin_session", "portal", "login");
  console.log(JSON.stringify({ event: "admin_login_succeeded" }));
  return adminJson({
    authenticated: true,
    csrfToken,
    expiresAt: expiresAt.toISOString(),
    replyDelivery: "email_client",
  }, 200, { "Set-Cookie": sessionCookie(token, SESSION_HOURS * 60 * 60) });
}

async function sessionInfo(request: Request, env: AdminEnv): Promise<Response> {
  requireSecrets(env);
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

async function listSubmissions(request: Request, env: AdminEnv): Promise<Response> {
  await authenticate(request, env);
  const url = new URL(request.url);
  const search = (url.searchParams.get("search") ?? "").normalize("NFKC").trim().slice(0, 100);
  const status = url.searchParams.get("status") ?? "";
  const kind = url.searchParams.get("kind") ?? "";
  const page = positiveInteger(url.searchParams.get("page"), 1, 10_000);
  const pageSize = positiveInteger(url.searchParams.get("pageSize"), 25, 50);
  if (status && !ALLOWED_STATUSES.has(status)) throw new AdminError(400, "INVALID_FILTER", "Choose a valid status filter.");
  if (kind && kind !== "trip" && kind !== "internship") throw new AdminError(400, "INVALID_FILTER", "Choose a valid opportunity filter.");

  const where: string[] = [];
  const bindings: unknown[] = [];
  if (search) {
    const like = `%${escapeLike(search)}%`;
    where.push(`(
      p.first_name LIKE ? ESCAPE '\\' OR p.last_name LIKE ? ESCAPE '\\' OR
      (p.first_name || ' ' || p.last_name) LIKE ? ESCAPE '\\' OR
      p.email LIKE ? ESCAPE '\\' OR COALESCE(p.phone, '') LIKE ? ESCAPE '\\'
    )`);
    bindings.push(like, like, like, like, like);
  }
  if (status) {
    where.push("EXISTS (SELECT 1 FROM interests filtered_status WHERE filtered_status.person_id = s.person_id AND filtered_status.status = ?)");
    bindings.push(status);
  }
  if (kind) {
    where.push(`EXISTS (
      SELECT 1 FROM interests filtered_interest
      JOIN opportunities filtered_opportunity ON filtered_opportunity.id = filtered_interest.opportunity_id
      WHERE filtered_interest.person_id = s.person_id AND filtered_opportunity.kind = ?
    )`);
    bindings.push(kind);
  }
  const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";
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
     ORDER BY s.created_at DESC
     LIMIT ? OFFSET ?`,
  ).bind(...bindings, pageSize, (page - 1) * pageSize).all<SubmissionListRow>();
  const summary = await env.DB.prepare(
    `SELECT
       (SELECT COUNT(*) FROM interest_submissions) AS submissions,
       (SELECT COUNT(*) FROM people) AS people,
       (SELECT COUNT(*) FROM interests) AS interests,
       (SELECT COUNT(*) FROM interests WHERE status = 'new') AS new_interests,
       (SELECT COUNT(*) FROM submission_replies WHERE delivery_status = 'sent') AS sent_replies`,
  ).first<Record<string, number>>();

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
    summary: summary ?? { submissions: 0, people: 0, interests: 0, new_interests: 0, sent_replies: 0 },
    pagination: {
      page,
      pageSize,
      total: Number(countRow?.total ?? 0),
      pages: Math.max(1, Math.ceil(Number(countRow?.total ?? 0) / pageSize)),
    },
  });
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

export function csvCell(value: unknown): string {
  let text = value === null || value === undefined ? "" : String(value);
  if (/^[\u0009\u0020]*[=+\-@]/.test(text)) text = `'${text}`;
  return `"${text.replace(/"/g, '""')}"`;
}

async function exportCsv(request: Request, env: AdminEnv): Promise<Response> {
  await authenticate(request, env);
  const rows = await env.DB.prepare(
    `SELECT s.id AS submission_id, s.created_at AS submitted_at,
            p.first_name, p.last_name, p.email, p.phone, p.contact_preference, p.field_of_study,
            s.preferred_timing, s.message,
            o.kind, o.title AS opportunity, o.location, o.partner, o.duration, i.status,
            (SELECT r.subject FROM submission_replies r WHERE r.submission_id = s.id ORDER BY r.created_at DESC LIMIT 1) AS last_reply_subject,
            (SELECT r.delivery_status FROM submission_replies r WHERE r.submission_id = s.id ORDER BY r.created_at DESC LIMIT 1) AS last_reply_status,
            (SELECT COALESCE(r.sent_at, r.created_at) FROM submission_replies r WHERE r.submission_id = s.id ORDER BY r.created_at DESC LIMIT 1) AS last_reply_at
     FROM interest_submissions s
     JOIN people p ON p.id = s.person_id
     JOIN interests i ON i.submission_id = s.id
     JOIN opportunities o ON o.id = i.opportunity_id
     ORDER BY s.created_at DESC, o.sort_order`,
  ).all<Record<string, unknown>>();
  const columns = [
    "submission_id", "submitted_at", "first_name", "last_name", "email", "phone", "contact_preference",
    "field_of_study", "preferred_timing", "message", "kind", "opportunity", "location", "partner", "duration",
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
  if (request.method === "GET" && path === "/admin/submissions") return listSubmissions(request, env);
  if (request.method === "GET" && path === "/admin/export.csv") return exportCsv(request, env);

  const detailMatch = path.match(/^\/admin\/submissions\/([0-9a-f-]{36})$/i);
  if (request.method === "GET" && detailMatch) return submissionDetail(request, env, detailMatch[1]);
  const statusMatch = path.match(/^\/admin\/submissions\/([0-9a-f-]{36})\/status$/i);
  if (request.method === "POST" && statusMatch) return updateInterestStatus(request, env, statusMatch[1]);
  const replyMatch = path.match(/^\/admin\/submissions\/([0-9a-f-]{36})\/replies$/i);
  if (request.method === "POST" && replyMatch) return createReply(request, env, replyMatch[1]);
  const sentMatch = path.match(/^\/admin\/replies\/([0-9a-f-]{36})\/sent$/i);
  if (request.method === "POST" && sentMatch) return markReplySent(request, env, sentMatch[1]);
  throw new AdminError(404, "NOT_FOUND", "Not found.");
}

export async function handleAdminRequest(request: Request, env: AdminEnv, path: string): Promise<Response> {
  try {
    return await routeAdmin(request, env, path);
  } catch (error) {
    if (error instanceof AdminError) {
      if (error.status >= 500) console.error(JSON.stringify({ event: "admin_request_failed", code: error.code, status: error.status }));
      return adminJson({ error: error.message, code: error.code }, error.status, error.headers);
    }
    console.error(JSON.stringify({ event: "admin_unhandled_error", message: error instanceof Error ? error.message : "Unknown error" }));
    return adminJson({ error: "The Admin Portal encountered an unexpected error.", code: "SERVER_ERROR" }, 500);
  }
}
