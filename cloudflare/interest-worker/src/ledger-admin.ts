import {
  AdminError, adminJson, authenticate, auditStatement, cleanLastContactedNote, readAdminJson, type AdminEnv,
} from "./admin";
import {
  buildDocumentBatchZip, DOCUMENT_BATCH_MAX_CONTACTS, DOCUMENT_TEMPLATE_MAX_BYTES,
  DocumentMergeError, type MergeContact, type MergeGift,
} from "./document-merge";
import {
  applyLedgerImportReview, LEDGER_IMPORT_MAX_FILE_BYTES, LedgerImportFileError, ledgerImportIdentity,
  parseLedgerImportFile, sha256Hex, type LedgerImportInput, type ParsedLedgerImport,
} from "./ledger-file";
import { buildLedgerWorkbook, type LedgerWorkbookRow } from "./ledger-xlsx";
import {
  cleanReceiptFileName, detectReceiptMedia, RECEIPT_MAX_FILE_BYTES, RECEIPT_MAX_FILES_PER_ENTRY,
  ReceiptFileError, receiptObjectKey, type ReceiptMedia,
} from "./receipt-file";

type LedgerSource = "csm" | "import" | "manual";
type LedgerType = "income" | "expense";
type LedgerRow = {
  id: string; source_type: LedgerSource; import_key: string; content_fingerprint: string;
  source_file_name: string | null; source_row_number: number | null; transaction_date: string;
  entry_type: LedgerType; payment_type: string; expense_category: string | null; budget_category: string;
  amount: number; name: string | null; person_id: string | null; note: string | null; currency: string;
  check_number: string | null;
  gross: number | null; fee: number | null; net: number | null; created_at: string; receipt_count: number;
};
type ExistingImportRow = { import_key: string; content_fingerprint: string };
type ReceiptRow = {
  id: string; ledger_entry_id: string; object_key: string; original_file_name: string;
  media_type: ReceiptMedia["mediaType"]; file_size: number; sha256: string; created_at: string;
};

const PAYMENT_DEFAULTS = ["ACH", "Bank transfer", "Cash", "Check", "Credit card", "PayPal", "Venmo", "Other"];
const EXPENSE_DEFAULTS = ["Administrative", "Fees", "Insurance", "Lodging", "Marketing", "Meals", "Ministry support", "Misc", "Supplies", "Transportation", "Travel", "Other"];
const BUDGET_DEFAULTS = ["General", "Fundraising", "Internship", "Marketing", "Mission trip", "Operations", "Other"];

function cleanLine(value: unknown, maximum: number, required = false): string | null {
  if (value === undefined || value === null || value === "") {
    if (required) throw new AdminError(422, "FIELD_REQUIRED", "Complete every required ledger field.");
    return null;
  }
  if (typeof value !== "string") throw new AdminError(422, "INVALID_LEDGER_ENTRY", "Use valid text in each ledger field.");
  const cleaned = value.normalize("NFKC").replace(/\s+/g, " ").trim();
  if (!cleaned) {
    if (required) throw new AdminError(422, "FIELD_REQUIRED", "Complete every required ledger field.");
    return null;
  }
  if (cleaned.length > maximum || /[\u0000-\u001F\u007F]/.test(cleaned)) throw new AdminError(422, "INVALID_LEDGER_ENTRY", `Use ${maximum} characters or fewer in this ledger field.`);
  return cleaned;
}

function cleanMessage(value: unknown, maximum: number): string | null {
  if (value === undefined || value === null || value === "") return null;
  if (typeof value !== "string") throw new AdminError(422, "INVALID_LEDGER_ENTRY", "Use valid text in the ledger note.");
  const cleaned = value.normalize("NFKC").replace(/\r\n?/g, "\n").trim();
  if (!cleaned) return null;
  if (cleaned.length > maximum || /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/.test(cleaned)) throw new AdminError(422, "INVALID_LEDGER_ENTRY", `Use ${maximum.toLocaleString("en-US")} characters or fewer in the ledger note.`);
  return cleaned;
}

function cleanDate(value: unknown, label = "date"): string {
  const cleaned = cleanLine(value, 10, true)!;
  const match = cleaned.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  const date = match ? new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]))) : new Date(Number.NaN);
  if (!match || date.getUTCFullYear() !== Number(match[1]) || date.getUTCMonth() !== Number(match[2]) - 1 || date.getUTCDate() !== Number(match[3])) {
    throw new AdminError(422, "INVALID_DATE", `Choose a valid ${label}.`);
  }
  return cleaned;
}

function cleanPositiveAmount(value: unknown): number {
  const amount = typeof value === "number" ? value : Number(String(value ?? "").replace(/[$,\s]/g, ""));
  if (!Number.isFinite(amount) || amount <= 0 || amount > 100_000_000) throw new AdminError(422, "INVALID_AMOUNT", "Enter an amount greater than zero and no more than $100,000,000.");
  return Math.round(amount * 100) / 100;
}

function cleanEntryType(value: unknown): LedgerType {
  if (value === "income" || value === "expense") return value;
  throw new AdminError(422, "INVALID_ENTRY_TYPE", "Choose Income or Expense.");
}

function cleanPersonIds(value: unknown, maximum = 100): string[] {
  if (!Array.isArray(value)) throw new AdminError(422, "CONTACTS_REQUIRED", "Select at least one contact.");
  const ids = [...new Set(value.filter((item): item is string => typeof item === "string").map(item => item.trim()).filter(item => /^[0-9a-f-]{36}$/i.test(item)))];
  if (!ids.length || ids.length > maximum || ids.length !== value.length) throw new AdminError(422, "INVALID_CONTACTS", `Select between 1 and ${maximum} valid contacts.`);
  return ids;
}

function chunk<T>(values: T[], size = 50): T[][] {
  const result: T[][] = [];
  for (let index = 0; index < values.length; index += size) result.push(values.slice(index, index + size));
  return result;
}

function mappedLedgerRow(row: LedgerRow): Record<string, unknown> {
  return {
    id: row.id, sourceType: row.source_type, transactionDate: row.transaction_date, entryType: row.entry_type,
    paymentType: row.payment_type, expenseCategory: row.expense_category, budgetCategory: row.budget_category,
    amount: Number(row.amount), name: row.name, personId: row.person_id, note: row.note, currency: row.currency,
    checkNumber: row.check_number,
    gross: row.gross === null ? null : Number(row.gross), fee: row.fee === null ? null : Number(row.fee),
    net: row.net === null ? null : Number(row.net), sourceFileName: row.source_file_name,
    sourceRowNumber: row.source_row_number, createdAt: row.created_at, receiptCount: Number(row.receipt_count ?? 0),
  };
}

async function categoryOptions(env: AdminEnv): Promise<{ paymentTypes: string[]; expenseCategories: string[]; budgetCategories: string[] }> {
  const rows = await env.DB.prepare(
    `SELECT 'payment' AS kind, payment_type AS value FROM ledger_entries WHERE payment_type <> ''
     UNION SELECT 'expense', expense_category FROM ledger_entries WHERE expense_category IS NOT NULL AND expense_category <> ''
     UNION SELECT 'budget', budget_category FROM ledger_entries WHERE budget_category <> ''`,
  ).all<{ kind: string; value: string }>();
  const merge = (defaults: string[], kind: string): string[] => [...new Set([...defaults, ...rows.results.filter(row => row.kind === kind).map(row => row.value)])].sort((a, b) => a.localeCompare(b, "en-US"));
  return { paymentTypes: merge(PAYMENT_DEFAULTS, "payment"), expenseCategories: merge(EXPENSE_DEFAULTS, "expense"), budgetCategories: merge(BUDGET_DEFAULTS, "budget") };
}

function ledgerWhere(url: URL): { clause: string; bindings: unknown[] } {
  const conditions: string[] = [];
  const bindings: unknown[] = [];
  const entryType = url.searchParams.get("entryType") ?? "";
  const sourceType = url.searchParams.get("sourceType") ?? "";
  const year = url.searchParams.get("year") ?? "";
  const search = (url.searchParams.get("search") ?? "").normalize("NFKC").replace(/\s+/g, " ").trim();
  if (entryType) {
    if (!new Set(["income", "expense"]).has(entryType)) throw new AdminError(422, "INVALID_FILTER", "Choose a valid ledger type filter.");
    conditions.push("entry_type = ?"); bindings.push(entryType);
  }
  if (sourceType) {
    if (!new Set(["csm", "import", "manual"]).has(sourceType)) throw new AdminError(422, "INVALID_FILTER", "Choose a valid ledger source filter.");
    conditions.push("source_type = ?"); bindings.push(sourceType);
  }
  if (year) {
    if (!/^\d{4}$/.test(year) || Number(year) < 2000 || Number(year) > 2200) throw new AdminError(422, "INVALID_FILTER", "Choose a valid ledger year.");
    conditions.push("transaction_date >= ? AND transaction_date < ?"); bindings.push(`${year}-01-01`, `${Number(year) + 1}-01-01`);
  }
  if (search) {
    if (search.length > 100) throw new AdminError(422, "INVALID_FILTER", "Search with 100 characters or fewer.");
    conditions.push("(name LIKE ? ESCAPE '\\' OR payment_type LIKE ? ESCAPE '\\' OR expense_category LIKE ? ESCAPE '\\' OR budget_category LIKE ? ESCAPE '\\' OR check_number LIKE ? ESCAPE '\\' OR note LIKE ? ESCAPE '\\')");
    const pattern = `%${search.replace(/[\\%_]/g, "\\$&")}%`;
    bindings.push(pattern, pattern, pattern, pattern, pattern, pattern);
  }
  return { clause: conditions.length ? `WHERE ${conditions.join(" AND ")}` : "", bindings };
}

async function listLedger(request: Request, env: AdminEnv): Promise<Response> {
  await authenticate(request, env);
  const url = new URL(request.url);
  const page = Math.max(1, Number.parseInt(url.searchParams.get("page") ?? "1", 10) || 1);
  const pageSize = Math.min(100, Math.max(10, Number.parseInt(url.searchParams.get("pageSize") ?? "50", 10) || 50));
  const where = ledgerWhere(url);
  const [count, summary, rows, categories] = await Promise.all([
    env.DB.prepare(`SELECT COUNT(*) AS count FROM ledger_entries ${where.clause}`).bind(...where.bindings).first<{ count: number }>(),
    env.DB.prepare(
      `SELECT COALESCE(SUM(CASE WHEN entry_type = 'income' THEN amount ELSE 0 END), 0) AS income,
              COALESCE(SUM(CASE WHEN entry_type = 'expense' THEN amount ELSE 0 END), 0) AS expense
       FROM ledger_entries ${where.clause}`,
    ).bind(...where.bindings).first<{ income: number; expense: number }>(),
    env.DB.prepare(
      `SELECT id, source_type, import_key, content_fingerprint, source_file_name, source_row_number,
              transaction_date, entry_type, payment_type, expense_category, budget_category, amount,
              name, person_id, check_number, note, currency, gross, fee, net, created_at,
              (SELECT COUNT(*) FROM ledger_receipts WHERE ledger_entry_id = ledger_entries.id) AS receipt_count
       FROM ledger_entries ${where.clause}
       ORDER BY transaction_date DESC, created_at DESC LIMIT ? OFFSET ?`,
    ).bind(...where.bindings, pageSize, (page - 1) * pageSize).all<LedgerRow>(),
    categoryOptions(env),
  ]);
  const total = Number(count?.count ?? 0);
  const income = Number(summary?.income ?? 0);
  const expense = Number(summary?.expense ?? 0);
  return adminJson({
    entries: rows.results.map(mappedLedgerRow), page, pageSize, total, pages: Math.max(1, Math.ceil(total / pageSize)),
    summary: { income, expense, balance: income - expense, count: total }, categories,
  });
}

type CleanLedgerEntry = {
  transactionDate: string; entryType: LedgerType; paymentType: string; expenseCategory: string | null;
  budgetCategory: string; amount: number; name: string | null; personId: string | null;
  checkNumber: string | null; note: string | null; contentFingerprint: string;
};

async function cleanLedgerEntry(body: Record<string, unknown>, env: AdminEnv): Promise<CleanLedgerEntry> {
  const transactionDate = cleanDate(body.transactionDate, "transaction date");
  const entryType = cleanEntryType(body.entryType);
  const paymentType = cleanLine(body.paymentType, 80, true)!;
  const expenseCategory = cleanLine(body.expenseCategory, 100);
  const budgetCategory = cleanLine(body.budgetCategory, 100, true)!;
  const amount = cleanPositiveAmount(body.amount);
  const checkNumber = cleanLine(body.checkNumber, 40);
  const note = cleanMessage(body.note, 1_000);
  const requestedName = cleanLine(body.name, 160);
  const personId = cleanLine(body.personId, 64);
  let name = requestedName;
  if (personId) {
    const person = await env.DB.prepare("SELECT first_name, last_name FROM people WHERE id = ?1").bind(personId).first<{ first_name: string; last_name: string }>();
    if (!person) throw new AdminError(422, "PERSON_NOT_FOUND", "Choose a valid contact for this ledger entry.");
    name = name || `${person.first_name} ${person.last_name}`;
  }
  const canonical = JSON.stringify([transactionDate, entryType, paymentType, expenseCategory, amount, name, personId, budgetCategory, checkNumber, note]);
  return { transactionDate, entryType, paymentType, expenseCategory, budgetCategory, amount, name, personId, checkNumber, note, contentFingerprint: await sha256Hex(canonical) };
}

async function createLedgerEntry(request: Request, env: AdminEnv): Promise<Response> {
  const session = await authenticate(request, env, true);
  const entry = await cleanLedgerEntry(await readAdminJson(request), env);
  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  await env.DB.batch([
    env.DB.prepare(
      `INSERT INTO ledger_entries
        (id, source_type, import_key, content_fingerprint, transaction_date, entry_type, payment_type,
         expense_category, budget_category, amount, name, person_id, check_number, note, currency,
         created_by_session_id, created_at, updated_at)
       VALUES (?1, 'manual', ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, 'USD', ?14, ?15, ?15)`,
    ).bind(id, `manual:${id}`, entry.contentFingerprint, entry.transactionDate, entry.entryType, entry.paymentType, entry.expenseCategory, entry.budgetCategory, entry.amount, entry.name, entry.personId, entry.checkNumber, entry.note, session.id, now),
    auditStatement(env, "ledger_entry", id, "created", { sourceType: "manual", entryType: entry.entryType, amount: entry.amount, transactionDate: entry.transactionDate }),
  ]);
  return adminJson({ entryId: id, success: true }, 201);
}

async function updateLedgerEntry(request: Request, env: AdminEnv, id: string): Promise<Response> {
  await authenticate(request, env, true);
  const existing = await env.DB.prepare("SELECT id, source_type, entry_type FROM ledger_entries WHERE id = ?1").bind(id).first<{ id: string; source_type: LedgerSource; entry_type: LedgerType }>();
  if (!existing) throw new AdminError(404, "LEDGER_ENTRY_NOT_FOUND", "The ledger entry no longer exists.");
  const entry = await cleanLedgerEntry(await readAdminJson(request), env);
  if (existing.entry_type === "expense" && entry.entryType === "income") {
    const receipt = await env.DB.prepare("SELECT id FROM ledger_receipts WHERE ledger_entry_id = ?1 LIMIT 1").bind(id).first<{ id: string }>();
    if (receipt) throw new AdminError(409, "LEDGER_RECEIPTS_ATTACHED", "Remove the attached receipts before changing this expense to income.");
  }
  const now = new Date().toISOString();
  const results = await env.DB.batch([
    env.DB.prepare(
      `UPDATE ledger_entries SET content_fingerprint = ?1, transaction_date = ?2, entry_type = ?3,
         payment_type = ?4, expense_category = ?5, budget_category = ?6, amount = ?7, name = ?8,
         person_id = ?9, check_number = ?10, note = ?11, updated_at = ?12 WHERE id = ?13`,
    ).bind(entry.contentFingerprint, entry.transactionDate, entry.entryType, entry.paymentType, entry.expenseCategory, entry.budgetCategory, entry.amount, entry.name, entry.personId, entry.checkNumber, entry.note, now, id),
    auditStatement(env, "ledger_entry", id, "updated", { sourceType: existing.source_type, entryType: entry.entryType, amount: entry.amount, transactionDate: entry.transactionDate }),
  ]);
  if (Number(results[0]?.meta.changes ?? 0) !== 1) throw new AdminError(409, "LEDGER_ENTRY_NOT_UPDATED", "The ledger entry could not be updated. Refresh and try again.");
  return adminJson({ success: true, entryId: id });
}

async function deleteLedgerEntry(request: Request, env: AdminEnv, id: string): Promise<Response> {
  await authenticate(request, env, true);
  const existing = await env.DB.prepare("SELECT id, source_type, transaction_date, entry_type, amount FROM ledger_entries WHERE id = ?1").bind(id).first<{ id: string; source_type: LedgerSource; transaction_date: string; entry_type: LedgerType; amount: number }>();
  if (!existing) throw new AdminError(404, "LEDGER_ENTRY_NOT_FOUND", "The ledger entry no longer exists.");
  const receipts = await env.DB.prepare("SELECT object_key FROM ledger_receipts WHERE ledger_entry_id = ?1").bind(id).all<{ object_key: string }>();
  const results = await env.DB.batch([
    env.DB.prepare("DELETE FROM ledger_entries WHERE id = ?1").bind(id),
    auditStatement(env, "ledger_entry", id, "deleted", { sourceType: existing.source_type, entryType: existing.entry_type, amount: Number(existing.amount), transactionDate: existing.transaction_date, receiptCount: receipts.results.length }),
  ]);
  if (Number(results[0]?.meta.changes ?? 0) !== 1) throw new AdminError(409, "LEDGER_ENTRY_NOT_DELETED", "The ledger entry could not be deleted. Refresh and try again.");
  if (receipts.results.length) {
    try { await env.RECEIPTS.delete(receipts.results.map(receipt => receipt.object_key)); }
    catch (error) { console.error(JSON.stringify({ event: "ledger_receipt_cleanup_failed", ledgerEntryId: id, objectKeys: receipts.results.map(receipt => receipt.object_key), message: error instanceof Error ? error.message : "Unknown error" })); }
  }
  return adminJson({ success: true, entryId: id });
}

async function readMultipart(request: Request, maximumFileBytes: number): Promise<{ formData: FormData; file: File; fileName: string; bytes: Uint8Array }> {
  const contentType = request.headers.get("content-type") ?? "";
  if (!contentType.toLocaleLowerCase("en-US").startsWith("multipart/form-data;")) throw new AdminError(415, "UNSUPPORTED_MEDIA_TYPE", "Upload the file from the Admin Portal.");
  const requestLimit = maximumFileBytes + 256 * 1024;
  const sizeLabel = `${Math.round(maximumFileBytes / (1024 * 1024))} MB`;
  const declaredLength = Number(request.headers.get("content-length") ?? 0);
  if (Number.isFinite(declaredLength) && declaredLength > requestLimit) throw new AdminError(413, "REQUEST_TOO_LARGE", `Choose a file no larger than ${sizeLabel}.`);
  const reader = request.body?.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  if (reader) {
    while (true) {
      const next = await reader.read();
      if (next.done) break;
      total += next.value.byteLength;
      if (total > requestLimit) { await reader.cancel(); throw new AdminError(413, "REQUEST_TOO_LARGE", `Choose a file no larger than ${sizeLabel}.`); }
      chunks.push(next.value);
    }
  }
  const body = new Uint8Array(total);
  let offset = 0;
  for (const current of chunks) { body.set(current, offset); offset += current.byteLength; }
  let formData: FormData;
  try { formData = await new Response(body, { headers: { "Content-Type": contentType } }).formData(); }
  catch { throw new AdminError(400, "INVALID_UPLOAD", "The uploaded file could not be read."); }
  const file = formData.get("file");
  if (!(file instanceof File)) throw new AdminError(422, "FILE_REQUIRED", "Choose a file to upload.");
  if (!file.size) throw new AdminError(422, "EMPTY_FILE", "Choose a file that is not empty.");
  if (file.size > maximumFileBytes) throw new AdminError(413, "REQUEST_TOO_LARGE", `Choose a file no larger than ${sizeLabel}.`);
  const fileName = file.name.normalize("NFKC").replace(/[\\/]+/g, "-").replace(/[\u0000-\u001F\u007F]/g, "").trim().slice(0, 180);
  if (!fileName) throw new AdminError(422, "INVALID_FILE_NAME", "Choose a file with a valid name.");
  return { formData, file, fileName, bytes: new Uint8Array(await file.arrayBuffer()) };
}

type ImportPreviewRow = {
  rowNumber: number; action: "new" | "already_loaded" | "conflict" | "error";
  input: LedgerImportInput | null; errors: string[]; importKey: string | null; contentFingerprint: string | null;
  values: Record<string, string>;
};

async function analyzeImport(env: AdminEnv, parsed: ParsedLedgerImport): Promise<{ rows: ImportPreviewRow[]; newRows: number; alreadyLoaded: number; conflicts: number; errors: number; canImport: boolean }> {
  const identities = new Map<number, { importKey: string; contentFingerprint: string }>();
  for (const row of parsed.rows) if (row.input) identities.set(row.rowNumber, await ledgerImportIdentity(row));
  const keys = [...new Set([...identities.values()].map(identity => identity.importKey))];
  const existing = new Map<string, string>();
  for (const values of chunk(keys)) {
    const result = await env.DB.prepare(`SELECT import_key, content_fingerprint FROM ledger_entries WHERE import_key IN (${values.map(() => "?").join(", ")})`).bind(...values).all<ExistingImportRow>();
    for (const row of result.results) existing.set(row.import_key, row.content_fingerprint);
  }
  const withinFile = new Set<string>();
  const rows: ImportPreviewRow[] = parsed.rows.map(row => {
    const identity = identities.get(row.rowNumber) ?? null;
    if (!row.input || !identity) return { rowNumber: row.rowNumber, action: "error", input: row.input, errors: row.errors, importKey: null, contentFingerprint: null, values: row.values };
    if (withinFile.has(identity.importKey)) return { rowNumber: row.rowNumber, action: "error", input: row.input, errors: ["This row duplicates another Seq # or transaction in the same spreadsheet."], values: row.values, ...identity };
    withinFile.add(identity.importKey);
    const prior = existing.get(identity.importKey);
    if (prior === identity.contentFingerprint) return { rowNumber: row.rowNumber, action: "already_loaded", input: row.input, errors: [], values: row.values, ...identity };
    if (prior) return { rowNumber: row.rowNumber, action: "conflict", input: row.input, errors: ["This Seq # was imported before, but its details are now different. Review the existing ledger entry instead of importing it twice."], values: row.values, ...identity };
    return { rowNumber: row.rowNumber, action: "new", input: row.input, errors: [], values: row.values, ...identity };
  });
  const count = (action: ImportPreviewRow["action"]): number => rows.filter(row => row.action === action).length;
  const newRows = count("new");
  return { rows, newRows, alreadyLoaded: count("already_loaded"), conflicts: count("conflict"), errors: count("error"), canImport: newRows > 0 };
}

function importPreviewJson(fileName: string, parsed: ParsedLedgerImport, preview: Awaited<ReturnType<typeof analyzeImport>>): Record<string, unknown> {
  return {
    fileName, fileType: parsed.fileType, sheetName: parsed.sheetName, headerRowNumber: parsed.headerRowNumber,
    newRows: preview.newRows, alreadyLoaded: preview.alreadyLoaded, conflicts: preview.conflicts, errors: preview.errors, canImport: preview.canImport,
    rows: preview.rows.map(row => ({
      rowNumber: row.rowNumber, action: row.action, errors: row.errors,
      transactionDate: row.input?.transactionDate ?? row.values.transactionDate, entryType: row.input?.entryType ?? row.values.entryType,
      paymentType: row.input?.paymentType ?? row.values.paymentType, expenseCategory: row.input?.expenseCategory ?? row.values.expenseCategory,
      amount: row.input?.amount ?? row.values.amount, name: row.input?.name ?? row.values.name,
      budgetCategory: row.input?.budgetCategory ?? row.values.budgetCategory, sequence: row.input?.sequence ?? row.values.sequence,
      checkNumber: row.input?.checkNumber ?? row.values.checkNumber, note: row.input?.note ?? row.values.note,
    })),
  };
}

async function previewLedgerImport(request: Request, env: AdminEnv): Promise<Response> {
  await authenticate(request, env, true);
  const upload = await readMultipart(request, LEDGER_IMPORT_MAX_FILE_BYTES);
  const parsed = parseLedgerImportFile(upload.fileName, upload.bytes);
  return adminJson({ preview: importPreviewJson(upload.fileName, parsed, await analyzeImport(env, parsed)) });
}

async function matchedPersonId(env: AdminEnv, input: LedgerImportInput): Promise<string | null> {
  if (input.entryType !== "income" || !input.name) return null;
  const normalized = input.name.normalize("NFKC").toLocaleLowerCase("en-US").replace(/\s+/g, " ").trim();
  const result = await env.DB.prepare(
    "SELECT id FROM people WHERE (first_name_normalized || ' ' || last_name_normalized) = ?1 ORDER BY updated_at DESC LIMIT 2",
  ).bind(normalized).all<{ id: string }>();
  return result.results.length === 1 ? result.results[0]!.id : null;
}

async function commitLedgerImport(request: Request, env: AdminEnv): Promise<Response> {
  const session = await authenticate(request, env, true);
  const upload = await readMultipart(request, LEDGER_IMPORT_MAX_FILE_BYTES);
  const parsed = applyLedgerImportReview(parseLedgerImportFile(upload.fileName, upload.bytes), upload.formData.get("reviewRows"));
  const preview = await analyzeImport(env, parsed);
  const ready = preview.rows.filter((row): row is ImportPreviewRow & { input: LedgerImportInput; importKey: string; contentFingerprint: string } => row.action === "new" && Boolean(row.input && row.importKey && row.contentFingerprint));
  const now = new Date().toISOString();
  let imported = 0;
  for (const group of chunk(ready, 50)) {
    const statements: D1PreparedStatement[] = [];
    for (const row of group) {
      const id = crypto.randomUUID();
      const personId = await matchedPersonId(env, row.input);
      statements.push(env.DB.prepare(
        `INSERT OR IGNORE INTO ledger_entries
          (id, source_type, import_key, content_fingerprint, source_file_name, source_row_number,
           transaction_date, entry_type, payment_type, expense_category, budget_category, amount,
           name, person_id, check_number, note, currency, created_by_session_id, created_at, updated_at)
         VALUES (?1, 'import', ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, 'USD', ?16, ?17, ?17)`,
      ).bind(
        id, row.importKey, row.contentFingerprint, upload.fileName, row.rowNumber,
        row.input.transactionDate, row.input.entryType, row.input.paymentType, row.input.expenseCategory,
        row.input.budgetCategory, row.input.amount, row.input.name, personId, row.input.checkNumber, row.input.note, session.id, now,
      ));
    }
    const results = await env.DB.batch(statements);
    imported += results.reduce((sum, result) => sum + Number(result.meta.changes ?? 0), 0);
  }
  const batchId = crypto.randomUUID();
  await env.DB.batch([
    auditStatement(env, "ledger_import", batchId, "imported", { fileName: upload.fileName, imported, alreadyLoaded: preview.alreadyLoaded, conflicts: preview.conflicts, errors: preview.errors }),
  ]);
  return adminJson({ import: { ...importPreviewJson(upload.fileName, parsed, preview), imported, skipped: preview.rows.length - imported } }, 201);
}

async function exportLedger(request: Request, env: AdminEnv): Promise<Response> {
  await authenticate(request, env);
  const rows = await env.DB.prepare(
    `SELECT id, source_type, import_key, content_fingerprint, source_file_name, source_row_number,
            transaction_date, entry_type, payment_type, expense_category, budget_category, amount,
            name, person_id, check_number, note, currency, gross, fee, net, created_at,
            (SELECT COUNT(*) FROM ledger_receipts WHERE ledger_entry_id = ledger_entries.id) AS receipt_count
     FROM ledger_entries ORDER BY transaction_date DESC, created_at DESC`,
  ).all<LedgerRow>();
  const workbookRows: LedgerWorkbookRow[] = rows.results.map(row => ({
    id: row.id, transactionDate: row.transaction_date, entryType: row.entry_type, paymentType: row.payment_type,
    expenseCategory: row.expense_category, amount: Number(row.amount), name: row.name, personId: row.person_id,
    budgetCategory: row.budget_category, note: row.note, sourceType: row.source_type, sourceFileName: row.source_file_name,
    checkNumber: row.check_number,
    sourceRowNumber: row.source_row_number, currency: row.currency, gross: row.gross === null ? null : Number(row.gross),
    fee: row.fee === null ? null : Number(row.fee), net: row.net === null ? null : Number(row.net),
    receiptCount: Number(row.receipt_count ?? 0), createdAt: row.created_at,
  }));
  const bytes = buildLedgerWorkbook(workbookRows);
  const stamp = new Date().toISOString().slice(0, 10);
  return new Response(new Uint8Array(bytes).buffer, { status: 200, headers: {
    "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "Content-Disposition": `attachment; filename="Hope-Sojourns-Ledger-${stamp}.xlsx"`,
    "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff",
  } });
}

type LedgerReceiptEntry = {
  id: string; transaction_date: string; entry_type: LedgerType; amount: number; name: string | null;
};

function receiptPreviewable(mediaType: string): boolean {
  return ["image/jpeg", "image/png", "image/webp", "image/avif"].includes(mediaType);
}

function mappedReceipt(row: ReceiptRow): Record<string, unknown> {
  return {
    id: row.id, ledgerEntryId: row.ledger_entry_id, originalFileName: row.original_file_name,
    mediaType: row.media_type, fileSize: Number(row.file_size), createdAt: row.created_at,
    previewable: receiptPreviewable(row.media_type),
  };
}

async function receiptLedgerEntry(env: AdminEnv, id: string): Promise<LedgerReceiptEntry> {
  const entry = await env.DB.prepare(
    "SELECT id, transaction_date, entry_type, amount, name FROM ledger_entries WHERE id = ?1",
  ).bind(id).first<LedgerReceiptEntry>();
  if (!entry) throw new AdminError(404, "LEDGER_ENTRY_NOT_FOUND", "The ledger entry no longer exists.");
  return entry;
}

async function listLedgerReceipts(request: Request, env: AdminEnv, ledgerEntryId: string): Promise<Response> {
  await authenticate(request, env);
  const entry = await receiptLedgerEntry(env, ledgerEntryId);
  const rows = await env.DB.prepare(
    `SELECT id, ledger_entry_id, object_key, original_file_name, media_type, file_size, sha256, created_at
     FROM ledger_receipts WHERE ledger_entry_id = ?1 ORDER BY created_at DESC`,
  ).bind(ledgerEntryId).all<ReceiptRow>();
  return adminJson({
    entry: { id: entry.id, transactionDate: entry.transaction_date, entryType: entry.entry_type, amount: Number(entry.amount), name: entry.name },
    receipts: rows.results.map(mappedReceipt),
    limits: { maxFiles: RECEIPT_MAX_FILES_PER_ENTRY, maxFileBytes: RECEIPT_MAX_FILE_BYTES },
  });
}

async function uploadLedgerReceipt(request: Request, env: AdminEnv, ledgerEntryId: string): Promise<Response> {
  const session = await authenticate(request, env, true);
  const entry = await receiptLedgerEntry(env, ledgerEntryId);
  if (entry.entry_type !== "expense") throw new AdminError(409, "RECEIPTS_REQUIRE_EXPENSE", "Receipts can only be attached to expense entries.");
  const count = await env.DB.prepare("SELECT COUNT(*) AS count FROM ledger_receipts WHERE ledger_entry_id = ?1").bind(ledgerEntryId).first<{ count: number }>();
  if (Number(count?.count ?? 0) >= RECEIPT_MAX_FILES_PER_ENTRY) {
    throw new AdminError(409, "RECEIPT_LIMIT_REACHED", `This expense already has the maximum of ${RECEIPT_MAX_FILES_PER_ENTRY} receipt files.`);
  }

  const upload = await readMultipart(request, RECEIPT_MAX_FILE_BYTES);
  const originalFileName = cleanReceiptFileName(upload.fileName);
  const media = detectReceiptMedia(upload.bytes);
  const receiptId = crypto.randomUUID();
  const objectKey = receiptObjectKey(ledgerEntryId, receiptId, media.extension);
  const digest = await sha256Hex(upload.bytes);
  const now = new Date().toISOString();

  await env.RECEIPTS.put(objectKey, upload.bytes, {
    httpMetadata: { contentType: media.mediaType, contentDisposition: "inline", cacheControl: "private, no-store" },
    customMetadata: { ledgerEntryId, receiptId, sha256: digest },
  });
  try {
    await env.DB.batch([
      env.DB.prepare(
        `INSERT INTO ledger_receipts
          (id, ledger_entry_id, object_key, original_file_name, media_type, file_size, sha256, created_by_session_id, created_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)`,
      ).bind(receiptId, ledgerEntryId, objectKey, originalFileName, media.mediaType, upload.bytes.byteLength, digest, session.id, now),
      auditStatement(env, "ledger_receipt", receiptId, "uploaded", {
        ledgerEntryId, originalFileName, mediaType: media.mediaType, fileSize: upload.bytes.byteLength, sha256: digest,
      }),
    ]);
  } catch (error) {
    await env.RECEIPTS.delete(objectKey).catch(() => undefined);
    throw error;
  }
  return adminJson({ success: true, receipt: mappedReceipt({
    id: receiptId, ledger_entry_id: ledgerEntryId, object_key: objectKey, original_file_name: originalFileName,
    media_type: media.mediaType, file_size: upload.bytes.byteLength, sha256: digest, created_at: now,
  }) }, 201);
}

async function viewLedgerReceipt(request: Request, env: AdminEnv, ledgerEntryId: string, receiptId: string): Promise<Response> {
  await authenticate(request, env);
  const receipt = await env.DB.prepare(
    `SELECT id, ledger_entry_id, object_key, original_file_name, media_type, file_size, sha256, created_at
     FROM ledger_receipts WHERE id = ?1 AND ledger_entry_id = ?2`,
  ).bind(receiptId, ledgerEntryId).first<ReceiptRow>();
  if (!receipt) throw new AdminError(404, "RECEIPT_NOT_FOUND", "The receipt file no longer exists.");
  const object = await env.RECEIPTS.get(receipt.object_key);
  if (!object) throw new AdminError(404, "RECEIPT_FILE_NOT_FOUND", "The receipt record exists, but its stored file could not be found.");

  const fallbackName = receipt.original_file_name.replace(/[^A-Za-z0-9._-]/g, "_") || "receipt";
  const encodedName = encodeURIComponent(receipt.original_file_name).replace(/['()*]/g, character => `%${character.charCodeAt(0).toString(16).toUpperCase()}`);
  const headers = new Headers({
    "Content-Type": receipt.media_type,
    "Content-Length": String(receipt.file_size),
    "Content-Disposition": `inline; filename="${fallbackName}"; filename*=UTF-8''${encodedName}`,
    "Cache-Control": "private, no-store",
    "Content-Security-Policy": "default-src 'none'; sandbox",
    "Cross-Origin-Resource-Policy": "same-origin",
    "Referrer-Policy": "no-referrer",
    "X-Content-Type-Options": "nosniff",
  });
  return new Response(object.body, { headers });
}

async function deleteLedgerReceipt(request: Request, env: AdminEnv, ledgerEntryId: string, receiptId: string): Promise<Response> {
  await authenticate(request, env, true);
  const receipt = await env.DB.prepare(
    `SELECT id, ledger_entry_id, object_key, original_file_name, media_type, file_size, sha256, created_at
     FROM ledger_receipts WHERE id = ?1 AND ledger_entry_id = ?2`,
  ).bind(receiptId, ledgerEntryId).first<ReceiptRow>();
  if (!receipt) throw new AdminError(404, "RECEIPT_NOT_FOUND", "The receipt file no longer exists.");
  const results = await env.DB.batch([
    env.DB.prepare("DELETE FROM ledger_receipts WHERE id = ?1 AND ledger_entry_id = ?2").bind(receiptId, ledgerEntryId),
    auditStatement(env, "ledger_receipt", receiptId, "deleted", {
      ledgerEntryId, originalFileName: receipt.original_file_name, mediaType: receipt.media_type,
      fileSize: Number(receipt.file_size), sha256: receipt.sha256,
    }),
  ]);
  if (Number(results[0]?.meta.changes ?? 0) !== 1) throw new AdminError(409, "RECEIPT_NOT_DELETED", "The receipt could not be deleted. Refresh and try again.");
  try { await env.RECEIPTS.delete(receipt.object_key); }
  catch (error) { console.error(JSON.stringify({ event: "ledger_receipt_cleanup_failed", ledgerEntryId, receiptId, objectKey: receipt.object_key, message: error instanceof Error ? error.message : "Unknown error" })); }
  return adminJson({ success: true, receiptId });
}
async function bulkContactActivity(request: Request, env: AdminEnv): Promise<Response> {
  await authenticate(request, env, true);
  const body = await readAdminJson(request);
  const personIds = cleanPersonIds(body.personIds, 100);
  const lastContactedAt = cleanDate(body.lastContactedAt, "latest activity date");
  const lastContactedNote = cleanLastContactedNote(body.lastContactedNote);
  const now = new Date().toISOString();
  const statements: D1PreparedStatement[] = [];
  for (const personId of personIds) {
    statements.push(
      env.DB.prepare("UPDATE people SET last_contacted_at = ?1, last_contacted_note = ?2, updated_at = ?3 WHERE id = ?4").bind(lastContactedAt, lastContactedNote, now, personId),
      auditStatement(env, "person", personId, "bulk_contact_activity_updated", { lastContactedAt, lastContactedNote }),
    );
  }
  const results = await env.DB.batch(statements);
  const updated = results.filter((_, index) => index % 2 === 0).reduce((sum, result) => sum + Number(result.meta.changes ?? 0), 0);
  return adminJson({ success: true, updated, requested: personIds.length, lastContactedAt, lastContactedNote });
}

function contactFromRow(row: Record<string, string | null>): MergeContact {
  return {
    id: row.id!, firstName: row.first_name!, lastName: row.last_name!, preferredName: row.preferred_name,
    organization: row.organization, email: row.email, phone: row.phone, addressLine1: row.address_line_1,
    addressLine2: row.address_line_2, city: row.city, region: row.region, postalCode: row.postal_code,
    country: row.country, lastContactedAt: row.last_contacted_at, lastContactedNote: row.last_contacted_note,
  };
}

async function generateContactDocuments(request: Request, env: AdminEnv): Promise<Response> {
  await authenticate(request, env, true);
  const upload = await readMultipart(request, DOCUMENT_TEMPLATE_MAX_BYTES);
  if (!/\.docx$/i.test(upload.fileName) || upload.bytes[0] !== 0x50 || upload.bytes[1] !== 0x4b) throw new AdminError(422, "INVALID_TEMPLATE", "Choose a valid Word .docx template.");
  let rawIds: unknown;
  try { rawIds = JSON.parse(String(upload.formData.get("personIds") ?? "[]")); }
  catch { throw new AdminError(422, "INVALID_CONTACTS", "Select valid contacts for the document batch."); }
  const personIds = cleanPersonIds(rawIds, DOCUMENT_BATCH_MAX_CONTACTS);
  const kindValue = String(upload.formData.get("kind") ?? "");
  const kind = kindValue === "giving_statement" ? "giving_statement" : kindValue === "mail_merge" ? "mail_merge" : null;
  if (!kind) throw new AdminError(422, "INVALID_DOCUMENT_TYPE", "Choose giving statements or a general mail merge.");
  const taxYearValue = String(upload.formData.get("taxYear") ?? "");
  const taxYear = /^\d{4}$/.test(taxYearValue) ? Number(taxYearValue) : new Date().getUTCFullYear() - 1;
  if (taxYear < 2000 || taxYear > 2200) throw new AdminError(422, "INVALID_TAX_YEAR", "Choose a valid tax year.");

  const placeholders = personIds.map(() => "?").join(", ");
  const people = await env.DB.prepare(
    `SELECT id, first_name, last_name, preferred_name, organization, email, phone,
            address_line_1, address_line_2, city, region, postal_code, country,
            last_contacted_at, last_contacted_note
     FROM people WHERE id IN (${placeholders})`,
  ).bind(...personIds).all<Record<string, string | null>>();
  const byId = new Map(people.results.map(row => [row.id!, contactFromRow(row)]));
  if (byId.size !== personIds.length) throw new AdminError(422, "CONTACT_NOT_FOUND", "One or more selected contacts no longer exist.");

  const giftsByPerson = new Map<string, MergeGift[]>();
  if (kind === "giving_statement") {
    const gifts = await env.DB.prepare(
      `SELECT person_id, transaction_date,
              CASE WHEN gross IS NOT NULL AND gross > 0 THEN gross ELSE amount END AS statement_amount,
              budget_category, payment_type
       FROM ledger_entries
       WHERE entry_type = 'income' AND person_id IN (${placeholders})
         AND transaction_date >= ? AND transaction_date < ?
       ORDER BY transaction_date ASC, created_at ASC`,
    ).bind(...personIds, `${taxYear}-01-01`, `${taxYear + 1}-01-01`).all<{ person_id: string; transaction_date: string; statement_amount: number; budget_category: string; payment_type: string }>();
    for (const gift of gifts.results) {
      if (!giftsByPerson.has(gift.person_id)) giftsByPerson.set(gift.person_id, []);
      giftsByPerson.get(gift.person_id)!.push({ date: gift.transaction_date, amount: Number(gift.statement_amount), designation: gift.budget_category, paymentMethod: gift.payment_type });
    }
  }

  const contacts = personIds.map(id => ({ contact: byId.get(id)!, gifts: giftsByPerson.get(id) ?? [] }));
  const bytes = buildDocumentBatchZip(upload.bytes, contacts, { kind, taxYear, templateName: upload.fileName });
  const batchId = crypto.randomUUID();
  await env.DB.batch([auditStatement(env, "contact_document_batch", batchId, "generated", { kind, taxYear, contactCount: contacts.length, templateName: upload.fileName })]);
  const label = kind === "giving_statement" ? `${taxYear}-Giving-Statements` : "Merged-Contact-Letters";
  return new Response(new Uint8Array(bytes).buffer, { status: 200, headers: {
    "Content-Type": "application/zip", "Content-Disposition": `attachment; filename="Hope-Sojourns-${label}.zip"`,
    "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff",
  } });
}

export function csmLedgerStatement(env: AdminEnv, input: {
  ledgerId: string; financialTransactionId: string; idempotencyKey: string; transactionDate: string;
  direction: "received" | "sent"; displayName: string; personId: string | null; currency: string;
  gross: number; fee: number; net: number; itemName: string | null; createdAt: string;
}): D1PreparedStatement {
  const entryType = input.direction === "received" ? "income" : "expense";
  const amount = Math.abs(input.net) || Math.abs(input.gross);
  return env.DB.prepare(
    `INSERT INTO ledger_entries
      (id, source_type, import_key, content_fingerprint, financial_transaction_id,
       transaction_date, entry_type, payment_type, expense_category, budget_category,
       amount, name, person_id, note, currency, gross, fee, net, created_at, updated_at)
     VALUES (?1, 'csm', ?2, ?3, ?4, ?5, ?6, 'PayPal', ?7, 'General', ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16, ?16)`,
  ).bind(
    input.ledgerId, `csm:${input.idempotencyKey}`, input.idempotencyKey, input.financialTransactionId,
    input.transactionDate, entryType, input.direction === "sent" ? "Ministry support" : null,
    amount, input.displayName, input.personId, input.itemName, input.currency,
    input.gross, input.fee, input.net, input.createdAt,
  );
}

function recognizedAdminError(error: unknown): AdminError | null {
  if (error instanceof AdminError) return error;
  if (error instanceof Error && typeof (error as { status?: unknown }).status === "number" && typeof (error as { code?: unknown }).code === "string") return error as AdminError;
  return null;
}

export async function handleLedgerAdminRequest(request: Request, env: AdminEnv, path: string): Promise<Response> {
  try {
    if (request.method === "GET" && path === "/admin/ledger") return await listLedger(request, env);
    if (request.method === "POST" && path === "/admin/ledger/entries") return await createLedgerEntry(request, env);
    const receiptCollectionRoute = path.match(/^\/admin\/ledger\/entries\/([^/]+)\/receipts$/);
    if (receiptCollectionRoute && (request.method === "GET" || request.method === "POST")) {
      const ledgerEntryId = cleanLine(decodeURIComponent(receiptCollectionRoute[1]!), 128, true)!;
      return request.method === "GET"
        ? await listLedgerReceipts(request, env, ledgerEntryId)
        : await uploadLedgerReceipt(request, env, ledgerEntryId);
    }
    const receiptFileRoute = path.match(/^\/admin\/ledger\/entries\/([^/]+)\/receipts\/([^/]+)\/file$/);
    if (receiptFileRoute && request.method === "GET") {
      const ledgerEntryId = cleanLine(decodeURIComponent(receiptFileRoute[1]!), 128, true)!;
      const receiptId = cleanLine(decodeURIComponent(receiptFileRoute[2]!), 128, true)!;
      return await viewLedgerReceipt(request, env, ledgerEntryId, receiptId);
    }
    const receiptRoute = path.match(/^\/admin\/ledger\/entries\/([^/]+)\/receipts\/([^/]+)$/);
    if (receiptRoute && request.method === "DELETE") {
      const ledgerEntryId = cleanLine(decodeURIComponent(receiptRoute[1]!), 128, true)!;
      const receiptId = cleanLine(decodeURIComponent(receiptRoute[2]!), 128, true)!;
      return await deleteLedgerReceipt(request, env, ledgerEntryId, receiptId);
    }
    const entryRoute = path.match(/^\/admin\/ledger\/entries\/([^/]+)$/);
    if (entryRoute && (request.method === "PUT" || request.method === "DELETE")) {
      const id = cleanLine(decodeURIComponent(entryRoute[1]!), 128, true)!;
      return request.method === "PUT" ? await updateLedgerEntry(request, env, id) : await deleteLedgerEntry(request, env, id);
    }
    if (request.method === "POST" && path === "/admin/ledger/imports/preview") return await previewLedgerImport(request, env);
    if (request.method === "POST" && path === "/admin/ledger/imports") return await commitLedgerImport(request, env);
    if (request.method === "GET" && path === "/admin/ledger/export.xlsx") return await exportLedger(request, env);
    if (request.method === "POST" && path === "/admin/contacts/bulk-activity") return await bulkContactActivity(request, env);
    if (request.method === "POST" && path === "/admin/contacts/documents") return await generateContactDocuments(request, env);
    throw new AdminError(404, "NOT_FOUND", "Not found.");
  } catch (error) {
    const recognized = recognizedAdminError(error);
    if (recognized) return adminJson({ error: recognized.message, code: recognized.code }, recognized.status, recognized.headers);
    if (error instanceof LedgerImportFileError) return adminJson({ error: error.message, code: error.code }, error.status);
    if (error instanceof ReceiptFileError) return adminJson({ error: error.message, code: error.code }, error.status);
    if (error instanceof DocumentMergeError) return adminJson({ error: error.message, code: "DOCUMENT_MERGE_FAILED" }, 422);
    console.error(JSON.stringify({ event: "ledger_admin_failed", message: error instanceof Error ? error.message : "Unknown error" }));
    return adminJson({ error: "The ledger encountered an unexpected error.", code: "SERVER_ERROR" }, 500);
  }
}
