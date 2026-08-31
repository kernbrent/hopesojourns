import { OfficeArchiveError, unzipOfficeArchive } from "./office-archive";

export const LEDGER_IMPORT_MAX_FILE_BYTES = 2 * 1024 * 1024;
export const LEDGER_IMPORT_MAX_ROWS = 1_000;
const FORMULA_SENTINEL = "__HOPE_SOJOURNS_FORMULA__";

export class LedgerImportFileError extends Error {
  constructor(readonly code: string, message: string, readonly status = 422) {
    super(message);
  }
}

export type LedgerImportInput = {
  sequence: string | null;
  transactionDate: string;
  entryType: "income" | "expense";
  paymentType: string;
  expenseCategory: string | null;
  amount: number;
  name: string | null;
  budgetCategory: string;
  note: string | null;
};

export type ParsedLedgerImportRow = {
  rowNumber: number;
  input: LedgerImportInput | null;
  errors: string[];
  canonical: string | null;
};

export type ParsedLedgerImport = {
  fileType: "xlsx" | "csv";
  sheetName: string;
  headerRowNumber: number;
  rows: ParsedLedgerImportRow[];
};

type LedgerColumnKey = "sequence" | "transactionDate" | "entryType" | "paymentType" | "expenseCategory" | "amount" | "name" | "budgetCategory" | "note";
type MatrixRow = { rowNumber: number; cells: string[] };

const COLUMNS: Array<{ key: LedgerColumnKey; aliases: string[] }> = [
  { key: "sequence", aliases: ["seq #", "seq", "sequence", "sequence number"] },
  { key: "transactionDate", aliases: ["date", "transaction date"] },
  { key: "entryType", aliases: ["income/expense", "income expense", "type", "entry type"] },
  { key: "paymentType", aliases: ["payment type", "payment method", "method"] },
  { key: "expenseCategory", aliases: ["expense category", "category"] },
  { key: "amount", aliases: ["amount", "transaction amount"] },
  { key: "name", aliases: ["name", "payee", "payer", "donor", "vendor"] },
  { key: "budgetCategory", aliases: ["budget category", "budget", "fund", "designation"] },
  { key: "note", aliases: ["note", "notes", "memo", "description"] },
];

function normalizeHeader(value: string): string {
  return value.normalize("NFKC").replace(/\*/g, "").replace(/[^\p{L}\p{N}#]+/gu, " ").trim().toLocaleLowerCase("en-US");
}

const aliases = new Map<string, LedgerColumnKey>();
for (const column of COLUMNS) for (const alias of column.aliases) aliases.set(normalizeHeader(alias), column.key);

function decodeXml(value: string): string {
  return value
    .replace(/&#x([0-9a-f]+);/gi, (_, digits: string) => String.fromCodePoint(Number.parseInt(digits, 16)))
    .replace(/&#([0-9]+);/g, (_, digits: string) => String.fromCodePoint(Number.parseInt(digits, 10)))
    .replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, "&");
}

function xmlAttribute(attributes: string, name: string): string | null {
  const match = attributes.match(new RegExp(`(?:^|\\s)${name.replace(":", "\\:")}=(?:"([^"]*)"|'([^']*)')`, "i"));
  return match ? decodeXml(match[1] ?? match[2] ?? "") : null;
}

function workbookText(entries: Map<string, Uint8Array>, name: string, required = true): string {
  const bytes = entries.get(name);
  if (!bytes) {
    if (required) throw new LedgerImportFileError("INVALID_EXCEL_FILE", "The Excel workbook is missing required information.");
    return "";
  }
  return new TextDecoder("utf-8").decode(bytes);
}

function sharedStrings(xml: string): string[] {
  if (!xml) return [];
  const values: string[] = [];
  for (const match of xml.matchAll(/<(?:[\w.-]+:)?si\b[^>]*>([\s\S]*?)<\/(?:[\w.-]+:)?si>/gi)) {
    values.push([...match[1].matchAll(/<(?:[\w.-]+:)?t\b[^>]*>([\s\S]*?)<\/(?:[\w.-]+:)?t>/gi)].map(part => decodeXml(part[1])).join(""));
  }
  return values;
}

function columnIndex(reference: string): number {
  const letters = reference.match(/^[A-Z]+/i)?.[0]?.toUpperCase() ?? "";
  let value = 0;
  for (const letter of letters) value = value * 26 + letter.charCodeAt(0) - 64;
  return Math.max(0, value - 1);
}

function parseWorksheet(xml: string, strings: string[]): MatrixRow[] {
  const rows: MatrixRow[] = [];
  let fallbackRowNumber = 0;
  for (const rowMatch of xml.matchAll(/<(?:[\w.-]+:)?row\b([^>]*)>([\s\S]*?)<\/(?:[\w.-]+:)?row>/gi)) {
    fallbackRowNumber += 1;
    const declaredRow = Number.parseInt(xmlAttribute(rowMatch[1], "r") ?? "", 10);
    const rowNumber = Number.isFinite(declaredRow) && declaredRow > 0 ? declaredRow : fallbackRowNumber;
    const cells: string[] = [];
    let fallbackColumn = 0;
    for (const cellMatch of rowMatch[2].matchAll(/<(?:[\w.-]+:)?c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/(?:[\w.-]+:)?c>)/gi)) {
      const attributes = cellMatch[1];
      const body = cellMatch[2] ?? "";
      const reference = xmlAttribute(attributes, "r");
      const index = reference ? columnIndex(reference) : fallbackColumn;
      fallbackColumn = index + 1;
      const type = xmlAttribute(attributes, "t") ?? "";
      let value = "";
      if (/<(?:[\w.-]+:)?f\b/i.test(body)) value = FORMULA_SENTINEL;
      else if (type === "inlineStr") value = [...body.matchAll(/<(?:[\w.-]+:)?t\b[^>]*>([\s\S]*?)<\/(?:[\w.-]+:)?t>/gi)].map(part => decodeXml(part[1])).join("");
      else {
        const raw = body.match(/<(?:[\w.-]+:)?v\b[^>]*>([\s\S]*?)<\/(?:[\w.-]+:)?v>/i)?.[1] ?? "";
        if (type === "s") {
          const sharedIndex = Number.parseInt(raw, 10);
          value = Number.isFinite(sharedIndex) ? strings[sharedIndex] ?? "" : "";
        } else if (type === "b") value = raw === "1" ? "TRUE" : "FALSE";
        else value = decodeXml(raw);
      }
      cells[index] = value;
    }
    rows.push({ rowNumber, cells });
  }
  return rows;
}

function resolveWorksheet(entries: Map<string, Uint8Array>): { sheetName: string; rows: MatrixRow[] } {
  const workbook = workbookText(entries, "xl/workbook.xml");
  const relationships = workbookText(entries, "xl/_rels/workbook.xml.rels");
  const sheets = [...workbook.matchAll(/<(?:[\w.-]+:)?sheet\b([^>]*)\/?\s*>/gi)].map(match => ({
    name: xmlAttribute(match[1], "name") ?? "",
    relationshipId: xmlAttribute(match[1], "r:id") ?? "",
  })).filter(sheet => sheet.name && sheet.relationshipId);
  const sheet = sheets.find(candidate => ["ledger", "sheet1"].includes(normalizeHeader(candidate.name))) ?? sheets[0];
  if (!sheet) throw new LedgerImportFileError("INVALID_EXCEL_FILE", "The Excel workbook does not contain a worksheet.");
  const targets = new Map<string, string>();
  for (const match of relationships.matchAll(/<(?:[\w.-]+:)?Relationship\b([^>]*)\/?\s*>/gi)) {
    const id = xmlAttribute(match[1], "Id");
    const target = xmlAttribute(match[1], "Target");
    if (id && target) targets.set(id, target);
  }
  const target = targets.get(sheet.relationshipId);
  if (!target) throw new LedgerImportFileError("INVALID_EXCEL_FILE", "The ledger worksheet could not be found.");
  const normalizedTarget = target.replace(/\\/g, "/").replace(/^\//, "");
  const path = normalizedTarget.startsWith("xl/") ? normalizedTarget : `xl/${normalizedTarget.replace(/^\.\//, "")}`;
  return { sheetName: sheet.name, rows: parseWorksheet(workbookText(entries, path), sharedStrings(workbookText(entries, "xl/sharedStrings.xml", false))) };
}

function parseCsv(text: string): MatrixRow[] {
  const rows: MatrixRow[] = [];
  let cells: string[] = [];
  let cell = "";
  let quoted = false;
  let rowNumber = 1;
  const source = text.replace(/^\uFEFF/, "");
  for (let index = 0; index <= source.length; index += 1) {
    const character = index === source.length ? "\n" : source[index];
    if (quoted) {
      if (character === '"' && source[index + 1] === '"') { cell += '"'; index += 1; }
      else if (character === '"') quoted = false;
      else cell += character;
    } else if (character === '"' && !cell) quoted = true;
    else if (character === ",") { cells.push(cell); cell = ""; }
    else if (character === "\n") { cells.push(cell.replace(/\r$/, "")); rows.push({ rowNumber, cells }); cells = []; cell = ""; rowNumber += 1; }
    else cell += character;
  }
  if (quoted) throw new LedgerImportFileError("INVALID_CSV", "The CSV contains an unfinished quoted cell.");
  return rows;
}

function cleanLine(value: string, maximum: number, label: string, errors: string[], required = false): string | null {
  const cleaned = value.normalize("NFKC").replace(/\s+/g, " ").trim();
  if (!cleaned) {
    if (required) errors.push(`${label} is required.`);
    return null;
  }
  if (cleaned.length > maximum || /[\u0000-\u001F\u007F]/.test(cleaned)) {
    errors.push(`${label} must use ${maximum} characters or fewer.`);
    return null;
  }
  return cleaned;
}

function normalizedDate(value: string, errors: string[]): string | null {
  const cleaned = value.trim();
  if (!cleaned) { errors.push("Date is required."); return null; }
  if (cleaned === FORMULA_SENTINEL) { errors.push("Replace the Date formula with its displayed value before importing."); return null; }
  if (/^\d+(?:\.\d+)?$/.test(cleaned)) {
    const serial = Number(cleaned);
    if (Number.isFinite(serial) && serial >= 1 && serial <= 2_958_465) {
      const date = new Date(Math.round((serial - 25_569) * 86_400_000));
      if (!Number.isNaN(date.getTime())) return date.toISOString().slice(0, 10);
    }
  }
  const iso = cleaned.match(/^(\d{4})-(\d{1,2})-(\d{1,2})(?:[T\s].*)?$/);
  const us = cleaned.match(/^(\d{1,2})[\/-](\d{1,2})[\/-](\d{4})$/);
  const year = Number(iso?.[1] ?? us?.[3]);
  const month = Number(iso?.[2] ?? us?.[1]);
  const day = Number(iso?.[3] ?? us?.[2]);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (!year || date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) {
    errors.push("Use a valid date.");
    return null;
  }
  return date.toISOString().slice(0, 10);
}

function normalizedAmount(value: string, errors: string[]): number | null {
  if (value === FORMULA_SENTINEL) { errors.push("Replace the Amount formula with its displayed value before importing."); return null; }
  const cleaned = value.normalize("NFKC").replace(/[$,\s]/g, "").replace(/^\((.*)\)$/, "-$1");
  const amount = Number(cleaned);
  if (!cleaned || !Number.isFinite(amount) || amount === 0 || Math.abs(amount) > 100_000_000) {
    errors.push("Amount must be a non-zero number no greater than $100,000,000.");
    return null;
  }
  return Math.round(Math.abs(amount) * 100) / 100;
}

function validateRow(rowNumber: number, values: Record<LedgerColumnKey, string>): ParsedLedgerImportRow {
  const errors: string[] = [];
  if (Object.values(values).some(value => value === FORMULA_SENTINEL)) {
    for (const [key, value] of Object.entries(values)) if (value === FORMULA_SENTINEL && key !== "transactionDate" && key !== "amount") errors.push("Replace formulas with displayed values before importing.");
  }
  const sequenceRaw = cleanLine(values.sequence, 30, "Seq #", errors);
  const sequence = sequenceRaw && /^\d+$/.test(sequenceRaw) ? String(Number.parseInt(sequenceRaw, 10)) : sequenceRaw;
  if (sequence && !/^[\p{L}\p{N}._-]+$/u.test(sequence)) errors.push("Seq # may use letters, numbers, periods, underscores, and hyphens only.");
  const transactionDate = normalizedDate(values.transactionDate, errors);
  const type = values.entryType.normalize("NFKC").replace(/\s+/g, " ").trim().toLocaleLowerCase("en-US");
  const entryType = type === "income" ? "income" : type === "expense" ? "expense" : null;
  if (!entryType) errors.push("Income/Expense must be Income or Expense.");
  const paymentType = cleanLine(values.paymentType, 80, "Payment Type", errors, true);
  const expenseCategory = cleanLine(values.expenseCategory, 100, "Expense Category", errors);
  const amount = normalizedAmount(values.amount, errors);
  const name = cleanLine(values.name, 160, "Name", errors);
  const budgetCategory = cleanLine(values.budgetCategory, 100, "Budget Category", errors, true);
  const note = cleanLine(values.note, 1_000, "Note", errors);
  if (errors.length || !transactionDate || !entryType || !paymentType || amount === null || !budgetCategory) return { rowNumber, input: null, errors, canonical: null };
  const input: LedgerImportInput = { sequence, transactionDate, entryType, paymentType, expenseCategory, amount, name, budgetCategory, note };
  const canonical = JSON.stringify([
    sequence ?? "", transactionDate, entryType, paymentType.toLocaleLowerCase("en-US"),
    expenseCategory?.toLocaleLowerCase("en-US") ?? "", amount.toFixed(2),
    name?.toLocaleLowerCase("en-US") ?? "", budgetCategory.toLocaleLowerCase("en-US"), note?.toLocaleLowerCase("en-US") ?? "",
  ]);
  return { rowNumber, input, errors: [], canonical };
}

function rowsFromMatrix(matrix: MatrixRow[], fileType: "xlsx" | "csv"): Omit<ParsedLedgerImport, "fileType" | "sheetName"> {
  let headerRow: MatrixRow | undefined;
  let columnMap = new Map<number, LedgerColumnKey>();
  for (const row of matrix.filter(candidate => candidate.rowNumber <= 20)) {
    const candidateMap = new Map<number, LedgerColumnKey>();
    const keys = new Set<LedgerColumnKey>();
    row.cells.forEach((cell, index) => {
      const key = aliases.get(normalizeHeader(cell ?? ""));
      if (key) { candidateMap.set(index, key); keys.add(key); }
    });
    if (["transactionDate", "entryType", "paymentType", "amount", "budgetCategory"].every(key => keys.has(key as LedgerColumnKey))) {
      headerRow = row;
      columnMap = candidateMap;
      break;
    }
  }
  if (!headerRow) throw new LedgerImportFileError("HEADERS_NOT_FOUND", "Keep the ledger headers unchanged, including Date, Income/Expense, Payment Type, Amount, and Budget Category.");

  const rows: ParsedLedgerImportRow[] = [];
  for (const row of matrix) {
    if (row.rowNumber <= headerRow.rowNumber) continue;
    const values = Object.fromEntries(COLUMNS.map(column => [column.key, ""])) as Record<LedgerColumnKey, string>;
    for (const [index, key] of columnMap) values[key] = String(row.cells[index] ?? "").normalize("NFKC").replace(/\r\n?/g, "\n").trim();
    const businessValues = COLUMNS.filter(column => column.key !== "sequence").map(column => values[column.key]);
    if (!businessValues.some(value => value.trim())) continue;
    rows.push(validateRow(row.rowNumber, values));
    if (rows.length > LEDGER_IMPORT_MAX_ROWS) throw new LedgerImportFileError("TOO_MANY_ROWS", `Import no more than ${LEDGER_IMPORT_MAX_ROWS.toLocaleString("en-US")} ledger entries at one time.`);
  }
  return { headerRowNumber: headerRow.rowNumber, rows };
}

export function parseLedgerImportFile(fileName: string, bytes: Uint8Array): ParsedLedgerImport {
  if (!bytes.byteLength) throw new LedgerImportFileError("EMPTY_FILE", "Choose a spreadsheet that contains ledger rows.");
  if (bytes.byteLength > LEDGER_IMPORT_MAX_FILE_BYTES) throw new LedgerImportFileError("FILE_TOO_LARGE", "Choose a spreadsheet smaller than 2 MB.", 413);
  const extension = fileName.toLocaleLowerCase("en-US").split(".").pop() ?? "";
  if (extension === "csv") return { fileType: "csv", sheetName: "CSV", ...rowsFromMatrix(parseCsv(new TextDecoder("utf-8").decode(bytes)), "csv") };
  if (extension !== "xlsx") throw new LedgerImportFileError("UNSUPPORTED_FILE", "Choose an Excel .xlsx file or a CSV ledger export.", 415);
  if (bytes[0] !== 0x50 || bytes[1] !== 0x4b) throw new LedgerImportFileError("INVALID_EXCEL_FILE", "Choose a valid Excel .xlsx file.");
  try {
    const worksheet = resolveWorksheet(unzipOfficeArchive(bytes, { maxEntries: 180, maxEntryBytes: 16 * 1024 * 1024, maxTotalBytes: 20 * 1024 * 1024 }));
    return { fileType: "xlsx", sheetName: worksheet.sheetName, ...rowsFromMatrix(worksheet.rows, "xlsx") };
  } catch (error) {
    if (error instanceof LedgerImportFileError) throw error;
    if (error instanceof OfficeArchiveError) throw new LedgerImportFileError("INVALID_EXCEL_FILE", error.message);
    throw error;
  }
}

export async function sha256Hex(value: string | Uint8Array): Promise<string> {
  const bytes = typeof value === "string" ? new TextEncoder().encode(value) : value;
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", new Uint8Array(bytes).buffer));
  return [...digest].map(byte => byte.toString(16).padStart(2, "0")).join("");
}

export async function ledgerImportIdentity(row: ParsedLedgerImportRow): Promise<{ importKey: string; contentFingerprint: string }> {
  if (!row.input || !row.canonical) throw new LedgerImportFileError("INVALID_ROW", "The ledger row is not ready to import.");
  const contentFingerprint = await sha256Hex(row.canonical);
  return {
    importKey: row.input.sequence ? `hsl-seq:${row.input.sequence.toLocaleLowerCase("en-US")}` : `hsl-content:${contentFingerprint}`,
    contentFingerprint,
  };
}
