import { parseDistributionMessage, type CsmDistributionMessage } from "./csm-distribution-contract";
import {
  AdminError, adminJson, authenticate, auditStatement, readAdminJson, secureEqual, type AdminEnv,
} from "./admin";

type CsmEnv = AdminEnv & { CSM_DISTRIBUTION_SECRET?: string; CSM_STATUS?: Fetcher };
type InboxStatus = "pending" | "needs_match" | "approved" | "denied" | "failed";
type InboxRow = {
  id: string; idempotency_key: string; payload_json: string; status: InboxStatus;
  matched_person_id: string | null; match_method: string | null;
  recipient_record_id: string | null; callback_status: string; decision_reason: string | null;
};
type PersonRow = { id: string; first_name: string; last_name: string; email: string };

const cleanLine = (value: unknown, maximum: number): string | null => {
  if (typeof value !== "string") return null;
  const cleaned = value.normalize("NFKC").replace(/\s+/g, " ").trim();
  return cleaned && cleaned.length <= maximum && !/[\u0000-\u001F\u007F]/.test(cleaned) ? cleaned : null;
};
const normalizedName = (value: string): string => value.normalize("NFKC").toLocaleLowerCase("en-US").replace(/\s+/g, " ").trim();
const normalizedEmail = (value: string): string => value.normalize("NFKC").trim().toLocaleLowerCase("en-US");
const normalizedPhone = (value: string | null): string | null => {
  const digits = (value || "").replace(/\D/g, "");
  return digits.length >= 7 && digits.length <= 18 ? digits : null;
};

async function requireSecret(request: Request, env: CsmEnv): Promise<void> {
  const supplied = request.headers.get("X-CSM-Distribution-Secret") || "";
  if (!env.CSM_DISTRIBUTION_SECRET || !(await secureEqual(supplied, env.CSM_DISTRIBUTION_SECRET))) {
    throw new AdminError(401, "CSM_AUTH_REQUIRED", "Unauthorized distribution request.");
  }
}

async function inboxByKey(env: CsmEnv, key: string): Promise<InboxRow | null> {
  return env.DB.prepare(
    `SELECT id, idempotency_key, payload_json, status, matched_person_id, match_method,
      recipient_record_id, callback_status, decision_reason FROM csm_distribution_inbox WHERE idempotency_key = ?1`,
  ).bind(key).first<InboxRow>();
}

async function matchDonor(env: CsmEnv, message: CsmDistributionMessage): Promise<{
  personId: string | null; method: "master_link" | "email" | null; status: "pending" | "needs_match";
}> {
  if (message.transaction.direction === "sent") return { personId: null, method: null, status: "pending" };
  const linked = await env.DB.prepare(
    "SELECT person_id AS personId FROM csm_donor_links WHERE master_donor_id = ?1",
  ).bind(message.masterDonorId).first<{ personId: string }>();
  if (linked) return { personId: linked.personId, method: "master_link", status: "pending" };
  if (!message.party.email) return { personId: null, method: null, status: "needs_match" };
  const candidates = await env.DB.prepare(
    "SELECT id FROM people WHERE email_normalized = ?1 ORDER BY updated_at DESC LIMIT 2",
  ).bind(normalizedEmail(message.party.email)).all<{ id: string }>();
  return candidates.results.length === 1
    ? { personId: candidates.results[0]!.id, method: "email", status: "pending" }
    : { personId: null, method: null, status: "needs_match" };
}

async function receive(request: Request, env: CsmEnv): Promise<Response> {
  await requireSecret(request, env);
  const message = parseDistributionMessage(await request.json().catch(() => null));
  if (message.destination !== "HopeSojourns") throw new AdminError(422, "WRONG_DESTINATION", "This message is not for Hope Sojourns.");
  const duplicate = await inboxByKey(env, message.idempotencyKey);
  if (duplicate) return adminJson({ inboxId: duplicate.id, status: duplicate.status, recordId: duplicate.recipient_record_id, duplicate: true });
  const match = await matchDonor(env, message);
  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  try {
    await env.DB.batch([
      env.DB.prepare(
        `INSERT INTO csm_distribution_inbox
          (id, message_id, idempotency_key, schema_version, source_record_id, source_transaction_id,
           source_event_code, source_revision, direction, display_name, master_donor_id, payload_json,
           status, matched_person_id, match_method, received_at, updated_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16, ?16)`,
      ).bind(
        id, message.messageId, message.idempotencyKey, message.schemaVersion,
        message.transaction.sourceRecordId, message.transaction.paypalTransactionId,
        message.transaction.eventCode, message.sourceRevision, message.transaction.direction,
        message.displayName, message.masterDonorId, JSON.stringify(message), match.status,
        match.personId, match.method, now,
      ),
      auditStatement(env, "csm_distribution", id, "received", {
        direction: message.transaction.direction, displayName: message.displayName, matchMethod: match.method,
      }),
    ]);
  } catch (error) {
    if (error instanceof Error && error.message.includes("UNIQUE constraint failed")) {
      const raced = await inboxByKey(env, message.idempotencyKey);
      if (raced) return adminJson({ inboxId: raced.id, status: raced.status, recordId: raced.recipient_record_id, duplicate: true });
    }
    throw error;
  }
  return adminJson({ inboxId: id, status: match.status, recordId: null }, 202);
}

async function candidates(env: CsmEnv, message: CsmDistributionMessage): Promise<PersonRow[]> {
  if (!message.party.email) return [];
  const result = await env.DB.prepare(
    "SELECT id, first_name, last_name, email FROM people WHERE email_normalized = ?1 ORDER BY updated_at DESC LIMIT 10",
  ).bind(normalizedEmail(message.party.email)).all<PersonRow>();
  return result.results;
}

async function listInbox(request: Request, env: CsmEnv): Promise<Response> {
  await authenticate(request, env);
  const status = new URL(request.url).searchParams.get("status") || "open";
  const allowed = ["pending", "needs_match", "approved", "denied", "failed"];
  if (status !== "open" && status !== "all" && !allowed.includes(status)) {
    throw new AdminError(422, "INVALID_STATUS", "Choose a valid inbox status.");
  }
  const where = status === "all" ? "" : status === "open"
    ? "WHERE inbox.status IN ('pending', 'needs_match', 'failed')" : "WHERE inbox.status = ?1";
  const result = await env.DB.prepare(
    `SELECT inbox.id, inbox.idempotency_key, inbox.payload_json, inbox.status,
      inbox.matched_person_id, inbox.match_method, inbox.decision_reason,
      inbox.recipient_record_id, inbox.callback_status, inbox.callback_error,
      inbox.received_at, inbox.updated_at, inbox.decided_at,
      person.first_name AS matched_first_name, person.last_name AS matched_last_name,
      person.email AS matched_email
     FROM csm_distribution_inbox AS inbox
     LEFT JOIN people AS person ON person.id = inbox.matched_person_id
     ${where} ORDER BY inbox.received_at DESC LIMIT 250`,
  ).bind(...(status === "open" || status === "all" ? [] : [status])).all<Record<string, unknown>>();
  const grouped = await env.DB.prepare("SELECT status, COUNT(*) AS count FROM csm_distribution_inbox GROUP BY status")
    .all<{ status: string; count: number }>();
  const messages = await Promise.all(result.results.map(async row => {
    const message = parseDistributionMessage(JSON.parse(String(row.payload_json)));
    return {
      id: row.id, idempotencyKey: row.idempotency_key, status: row.status,
      matchMethod: row.match_method, decisionReason: row.decision_reason,
      recordId: row.recipient_record_id, callbackStatus: row.callback_status,
      callbackError: row.callback_error, receivedAt: row.received_at,
      updatedAt: row.updated_at, decidedAt: row.decided_at,
      displayName: message.displayName, direction: message.transaction.direction,
      party: message.party, transaction: message.transaction,
      matchedPerson: row.matched_person_id ? {
        id: row.matched_person_id, firstName: row.matched_first_name,
        lastName: row.matched_last_name, email: row.matched_email,
      } : null,
      candidates: await candidates(env, message),
    };
  }));
  return adminJson({ messages, counts: Object.fromEntries(grouped.results.map(row => [row.status, Number(row.count)])) });
}

async function inboxRecord(env: CsmEnv, id: string): Promise<{ row: InboxRow; message: CsmDistributionMessage }> {
  const row = await env.DB.prepare(
    `SELECT id, idempotency_key, payload_json, status, matched_person_id, match_method,
      recipient_record_id, callback_status, decision_reason FROM csm_distribution_inbox WHERE id = ?1`,
  ).bind(id).first<InboxRow>();
  if (!row) throw new AdminError(404, "INBOX_NOT_FOUND", "This CSM transaction was not found.");
  return { row, message: parseDistributionMessage(JSON.parse(row.payload_json)) };
}

async function notifyCsm(env: CsmEnv, row: InboxRow, status: InboxStatus, reason: string | null): Promise<"sent" | "failed"> {
  const now = new Date().toISOString();
  try {
    if (!env.CSM_STATUS || !env.CSM_DISTRIBUTION_SECRET) throw new Error("CSM status binding is not configured");
    const response = await env.CSM_STATUS.fetch("https://csm.internal/internal/csm-distribution/status", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-CSM-Distribution-Secret": env.CSM_DISTRIBUTION_SECRET },
      body: JSON.stringify({
        idempotencyKey: row.idempotency_key, status, inboxId: row.id,
        recordId: row.recipient_record_id, reason,
      }),
    });
    if (!response.ok) throw new Error(`CSM returned HTTP ${response.status}`);
    await env.DB.prepare(
      "UPDATE csm_distribution_inbox SET callback_status = 'sent', callback_attempts = callback_attempts + 1, callback_error = NULL, updated_at = ?1 WHERE id = ?2",
    ).bind(now, row.id).run();
    return "sent";
  } catch (error) {
    const detail = error instanceof Error ? error.message : "Unknown callback error";
    await env.DB.prepare(
      "UPDATE csm_distribution_inbox SET callback_status = 'failed', callback_attempts = callback_attempts + 1, callback_error = ?1, updated_at = ?2 WHERE id = ?3",
    ).bind(detail, now, row.id).run();
    return "failed";
  }
}

function newDonor(body: Record<string, unknown>, message: CsmDistributionMessage): {
  firstName: string; lastName: string; email: string; phone: string | null;
} {
  const donor = typeof body.donor === "object" && body.donor !== null ? body.donor as Record<string, unknown> : {};
  const firstName = cleanLine(donor.firstName, 70);
  const lastName = cleanLine(donor.lastName, 70);
  const email = cleanLine(donor.email ?? message.party.email, 254);
  const phone = cleanLine(donor.phone ?? message.party.phone, 40);
  if (!firstName || !lastName || !email || !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(normalizedEmail(email))) {
    throw new AdminError(422, "DONOR_DETAILS_REQUIRED", "Enter the donor's first name, last name, and valid email address.");
  }
  return { firstName, lastName, email, phone };
}

async function approve(request: Request, env: CsmEnv, id: string): Promise<Response> {
  const session = await authenticate(request, env, true);
  const body = await readAdminJson(request);
  const { row, message } = await inboxRecord(env, id);
  if (row.status === "approved") return adminJson({ success: true, status: "approved", recordId: row.recipient_record_id, duplicate: true });
  if (row.status === "denied") throw new AdminError(409, "ALREADY_DENIED", "This transaction was already denied.");
  const statements: D1PreparedStatement[] = [];
  const now = new Date().toISOString();
  let personId: string | null = null;
  let matchMethod: string | null = null;
  if (message.transaction.direction === "received") {
    const requested = cleanLine(body.personId, 64);
    personId = requested || row.matched_person_id;
    if (personId) {
      const exists = await env.DB.prepare("SELECT id FROM people WHERE id = ?1").bind(personId).first<{ id: string }>();
      if (!exists) throw new AdminError(422, "PERSON_NOT_FOUND", "Choose an existing donor or create a new one.");
      matchMethod = requested ? "manual" : row.match_method;
    } else {
      const input = newDonor(body, message);
      personId = crypto.randomUUID();
      matchMethod = "new_donor";
      statements.push(env.DB.prepare(
        `INSERT INTO people
          (id, first_name, last_name, first_name_normalized, last_name_normalized,
           email, email_normalized, phone, phone_normalized, contact_preference,
           preferred_name, address_line_1, address_line_2, city, region, postal_code, country,
           record_source, contact_status, created_at, updated_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, 'email', NULL, ?10, ?11, ?12, ?13, ?14, ?15,
           'manual', 'active', ?16, ?16)`,
      ).bind(
        personId, input.firstName, input.lastName, normalizedName(input.firstName), normalizedName(input.lastName),
        input.email, normalizedEmail(input.email), input.phone, normalizedPhone(input.phone),
        message.party.address?.line1, message.party.address?.line2, message.party.address?.city,
        message.party.address?.state, message.party.address?.postalCode, message.party.address?.countryCode, now,
      ));
    }
    statements.push(
      env.DB.prepare("INSERT OR IGNORE INTO contact_types (person_id, contact_type, created_at) VALUES (?1, 'donor', ?2)").bind(personId, now),
      env.DB.prepare(
        `INSERT INTO csm_donor_links (master_donor_id, person_id, created_from_inbox_id, created_at, updated_at)
         VALUES (?1, ?2, ?3, ?4, ?4)
         ON CONFLICT (master_donor_id) DO UPDATE SET person_id = excluded.person_id, updated_at = excluded.updated_at`,
      ).bind(message.masterDonorId, personId, id, now),
    );
  }
  const recordId = crypto.randomUUID();
  statements.push(
    env.DB.prepare(
      `INSERT INTO financial_transactions
        (id, source_inbox_id, idempotency_key, paypal_transaction_id, paypal_event_code,
         transaction_date, direction, display_name, person_id, currency, gross, fee, net,
         item_name, item_id, created_at)
       VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16)`,
    ).bind(
      recordId, id, row.idempotency_key, message.transaction.paypalTransactionId,
      message.transaction.eventCode, message.transaction.eventDate, message.transaction.direction,
      message.displayName, personId, message.transaction.currency, message.transaction.gross,
      message.transaction.fee, message.transaction.net, message.transaction.itemName,
      message.transaction.itemId, now,
    ),
    env.DB.prepare(
      `UPDATE csm_distribution_inbox SET status = 'approved', matched_person_id = ?1, match_method = ?2,
       recipient_record_id = ?3, callback_status = 'pending', decision_reason = NULL,
       decided_at = ?4, decided_by_session_id = ?5, updated_at = ?4 WHERE id = ?6`,
    ).bind(personId, matchMethod, recordId, now, session.id, id),
    auditStatement(env, "csm_distribution", id, "approved", { recordId, personId, matchMethod }),
  );
  await env.DB.batch(statements);
  const callbackStatus = await notifyCsm(env, { ...row, recipient_record_id: recordId }, "approved", null);
  return adminJson({ success: true, status: "approved", recordId, personId, callbackStatus });
}

async function deny(request: Request, env: CsmEnv, id: string): Promise<Response> {
  const session = await authenticate(request, env, true);
  const body = await readAdminJson(request);
  const reason = cleanLine(body.reason, 500);
  if (!reason) throw new AdminError(422, "REASON_REQUIRED", "Enter a reason for denying this transaction.");
  const { row } = await inboxRecord(env, id);
  if (row.status === "approved") throw new AdminError(409, "ALREADY_APPROVED", "This transaction was already approved.");
  if (row.status === "denied") return adminJson({ success: true, status: "denied", duplicate: true });
  const now = new Date().toISOString();
  await env.DB.batch([
    env.DB.prepare(
      `UPDATE csm_distribution_inbox SET status = 'denied', decision_reason = ?1,
       callback_status = 'pending', decided_at = ?2, decided_by_session_id = ?3, updated_at = ?2 WHERE id = ?4`,
    ).bind(reason, now, session.id, id),
    auditStatement(env, "csm_distribution", id, "denied", { reason }),
  ]);
  return adminJson({ success: true, status: "denied", callbackStatus: await notifyCsm(env, row, "denied", reason) });
}

async function retryNotification(request: Request, env: CsmEnv, id: string): Promise<Response> {
  await authenticate(request, env, true);
  const { row } = await inboxRecord(env, id);
  if (row.status !== "approved" && row.status !== "denied") {
    throw new AdminError(409, "DECISION_REQUIRED", "Approve or deny this transaction before notifying CSM.");
  }
  const callbackStatus = await notifyCsm(env, row, row.status, row.status === "denied" ? row.decision_reason : null);
  return adminJson({ success: callbackStatus === "sent", callbackStatus });
}
function recognizedAdminError(error: unknown): AdminError | null {
  if (error instanceof AdminError) return error;
  if (
    error instanceof Error
    && typeof (error as { status?: unknown }).status === "number"
    && typeof (error as { code?: unknown }).code === "string"
  ) {
    return error as AdminError;
  }
  return null;
}


export async function handleCsmDelivery(request: Request, env: CsmEnv): Promise<Response> {
  try {
    if (request.method !== "POST") throw new AdminError(405, "METHOD_NOT_ALLOWED", "Method not allowed.");
    return await receive(request, env);
  } catch (error) {
    const recognized = recognizedAdminError(error);
    if (recognized) return adminJson({ error: recognized.message, code: recognized.code }, recognized.status, recognized.headers);
    console.error(JSON.stringify({ event: "csm_delivery_failed", message: error instanceof Error ? error.message : "Unknown error" }));
    return adminJson({ error: "The CSM transaction could not be received.", code: "SERVER_ERROR" }, 500);
  }
}

export async function handleCsmAdminRequest(request: Request, env: CsmEnv, path: string): Promise<Response> {
  try {
    if (request.method === "GET" && path === "/admin/csm-inbox") return await listInbox(request, env);
    const approveMatch = path.match(/^\/admin\/csm-inbox\/([0-9a-f-]{36})\/approve$/i);
    if (request.method === "POST" && approveMatch) return await approve(request, env, approveMatch[1]!);
    const denyMatch = path.match(/^\/admin\/csm-inbox\/([0-9a-f-]{36})\/deny$/i);
    if (request.method === "POST" && denyMatch) return await deny(request, env, denyMatch[1]!);
    const notifyMatch = path.match(/^\/admin\/csm-inbox\/([0-9a-f-]{36})\/notify$/i);
    if (request.method === "POST" && notifyMatch) return await retryNotification(request, env, notifyMatch[1]!);
    throw new AdminError(404, "NOT_FOUND", "Not found.");
  } catch (error) {
    const recognized = recognizedAdminError(error);
    if (recognized) return adminJson({ error: recognized.message, code: recognized.code }, recognized.status, recognized.headers);
    console.error(JSON.stringify({ event: "csm_admin_failed", message: error instanceof Error ? error.message : "Unknown error" }));
    return adminJson({ error: "The CSM inbox encountered an unexpected error.", code: "SERVER_ERROR" }, 500);
  }
}
