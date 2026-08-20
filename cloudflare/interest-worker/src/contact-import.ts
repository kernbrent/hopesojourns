import { inflateRawSync } from "node:zlib";

export const CONTACT_IMPORT_MAX_FILE_BYTES = 2 * 1024 * 1024;
export const CONTACT_IMPORT_MAX_ROWS = 250;
const CONTACT_IMPORT_MAX_UNCOMPRESSED_BYTES = 16 * 1024 * 1024;
const CONTACT_IMPORT_MAX_ZIP_ENTRIES = 160;
const FORMULA_SENTINEL = "__HOPE_SOJOURNS_FORMULA__";

export class ContactImportFileError extends Error {
  constructor(readonly code: string, message: string, readonly status = 422) {
    super(message);
  }
}

export type ContactImportOpportunity = {
  id: string;
  slug: string;
  title: string;
  location: string | null;
};

export type ContactImportInput = {
  contactId: string | null;
  firstName: string;
  lastName: string;
  preferredName: string | null;
  email: string;
  phone: string | null;
  contactPreference: "email" | "phone" | null;
  contactStatus: "active" | "inactive" | null;
  contactTypes: string[];
  areas: string[];
  organization: string | null;
  website: string | null;
  addressLine1: string | null;
  addressLine2: string | null;
  city: string | null;
  region: string | null;
  postalCode: string | null;
  country: string | null;
  languages: string[];
  tripIds: string[];
  fieldOfStudy: string | null;
  lastContactedAt: string | null;
  notes: string | null;
};

export type ParsedContactImportRow = {
  rowNumber: number;
  values: Record<ContactColumnKey, string>;
};

export type ParsedContactImport = {
  fileType: "xlsx" | "csv";
  sheetName: string;
  headerRowNumber: number;
  rows: ParsedContactImportRow[];
};

export type ValidatedContactImportRow = {
  rowNumber: number;
  input: ContactImportInput | null;
  errors: string[];
  warnings: string[];
};

type ContactColumnKey =
  | "contactId"
  | "firstName"
  | "lastName"
  | "preferredName"
  | "email"
  | "phone"
  | "contactPreference"
  | "contactStatus"
  | "contactTypes"
  | "areas"
  | "organization"
  | "website"
  | "addressLine1"
  | "addressLine2"
  | "city"
  | "region"
  | "postalCode"
  | "country"
  | "languages"
  | "tripCodes"
  | "fieldOfStudy"
  | "lastContacted"
  | "notes";

type MatrixRow = { rowNumber: number; cells: string[] };

const CONTACT_COLUMNS: Array<{ key: ContactColumnKey; aliases: string[] }> = [
  { key: "contactId", aliases: ["contact id", "contact_id", "id"] },
  { key: "firstName", aliases: ["first name", "first_name", "firstname"] },
  { key: "lastName", aliases: ["last name", "last_name", "lastname"] },
  { key: "preferredName", aliases: ["preferred name", "preferred_name", "nickname"] },
  { key: "email", aliases: ["email", "email address", "email_address"] },
  { key: "phone", aliases: ["cell phone", "cell number", "phone", "phone number", "mobile"] },
  { key: "contactPreference", aliases: ["preferred contact", "contact preference", "contact_preference"] },
  { key: "contactStatus", aliases: ["contact status", "status", "contact_status"] },
  { key: "contactTypes", aliases: ["contact types", "contact type", "contact_types"] },
  { key: "areas", aliases: ["hope sojourns areas", "hope sojourns area", "areas", "hope_sojourns_areas"] },
  { key: "organization", aliases: ["organization", "organisation", "company"] },
  { key: "website", aliases: ["website", "web site", "url"] },
  { key: "addressLine1", aliases: ["address line 1", "address 1", "street address", "address_line_1"] },
  { key: "addressLine2", aliases: ["address line 2", "address 2", "suite", "address_line_2"] },
  { key: "city", aliases: ["city"] },
  { key: "region", aliases: ["state province region", "state province", "state", "province", "region"] },
  { key: "postalCode", aliases: ["postal code", "zip code", "zip", "postal_code"] },
  { key: "country", aliases: ["country"] },
  { key: "languages", aliases: ["languages spoken", "languages", "language"] },
  { key: "tripCodes", aliases: ["trip codes", "trip code", "trips", "trip_codes"] },
  { key: "fieldOfStudy", aliases: ["school field specialty", "school field", "field of study", "specialty", "field_of_study"] },
  { key: "lastContacted", aliases: ["last contacted", "last contacted date", "last_contacted_at"] },
  { key: "notes", aliases: ["notes", "note"] },
];

const CONTACT_TYPE_LOOKUP = new Map<string, string>([
  ["prospective traveler", "prospective_traveler"],
  ["prospective_traveler", "prospective_traveler"],
  ["traveler", "traveler"],
  ["leader", "leader"],
  ["donor", "donor"],
  ["ministry contact", "ministry_contact"],
  ["ministry_contact", "ministry_contact"],
  ["hope sojourns staff", "staff"],
  ["staff", "staff"],
  ["volunteer", "volunteer"],
  ["other", "other"],
]);

const AREA_LOOKUP = new Map<string, string>([
  ["mission", "mission"],
  ["missions", "mission"],
  ["intern", "intern"],
  ["internship", "intern"],
  ["internships", "intern"],
  ["corporate", "corporate"],
]);

const headerAliases = new Map<string, ContactColumnKey>();
for (const column of CONTACT_COLUMNS) {
  for (const alias of column.aliases) headerAliases.set(normalizeHeader(alias), column.key);
}

function normalizeHeader(value: string): string {
  return value.normalize("NFKC").replace(/\*/g, "").replace(/[^\p{L}\p{N}]+/gu, " ").trim().toLocaleLowerCase("en-US");
}

export function normalizeImportName(value: string): string {
  return value.normalize("NFKC").toLocaleLowerCase("en-US").replace(/\s+/g, " ").trim();
}

export function normalizeImportEmail(value: string): string {
  return value.normalize("NFKC").trim().toLocaleLowerCase("en-US");
}

export function normalizeImportPhone(value: string | null): string | null {
  if (!value) return null;
  const digits = value.replace(/\D/g, "");
  return digits.length >= 7 && digits.length <= 18 ? digits : null;
}

function decodeXml(value: string): string {
  return value
    .replace(/&#x([0-9a-f]+);/gi, (_, digits: string) => String.fromCodePoint(Number.parseInt(digits, 16)))
    .replace(/&#([0-9]+);/g, (_, digits: string) => String.fromCodePoint(Number.parseInt(digits, 10)))
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&");
}

function xmlAttribute(attributes: string, name: string): string | null {
  const match = attributes.match(new RegExp(`(?:^|\\s)${name.replace(":", "\\:")}=(?:"([^"]*)"|'([^']*)')`, "i"));
  return match ? decodeXml(match[1] ?? match[2] ?? "") : null;
}

function readU16(view: DataView, offset: number): number {
  if (offset < 0 || offset + 2 > view.byteLength) throw new ContactImportFileError("INVALID_EXCEL_FILE", "The Excel file is incomplete or damaged.");
  return view.getUint16(offset, true);
}

function readU32(view: DataView, offset: number): number {
  if (offset < 0 || offset + 4 > view.byteLength) throw new ContactImportFileError("INVALID_EXCEL_FILE", "The Excel file is incomplete or damaged.");
  return view.getUint32(offset, true);
}

function unzipWorkbook(bytes: Uint8Array): Map<string, Uint8Array> {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const minimumEocd = Math.max(0, bytes.byteLength - 65_557);
  let eocdOffset = -1;
  for (let offset = bytes.byteLength - 22; offset >= minimumEocd; offset -= 1) {
    if (readU32(view, offset) === 0x06054b50) {
      eocdOffset = offset;
      break;
    }
  }
  if (eocdOffset < 0) throw new ContactImportFileError("INVALID_EXCEL_FILE", "Choose a valid Excel .xlsx file.");

  const entryCount = readU16(view, eocdOffset + 10);
  const centralSize = readU32(view, eocdOffset + 12);
  const centralOffset = readU32(view, eocdOffset + 16);
  if (!entryCount || entryCount > CONTACT_IMPORT_MAX_ZIP_ENTRIES || centralOffset + centralSize > bytes.byteLength) {
    throw new ContactImportFileError("UNSAFE_EXCEL_FILE", "This Excel file is too complex to import safely.");
  }

  const entries: Array<{ name: string; method: number; compressedSize: number; uncompressedSize: number; localOffset: number }> = [];
  const decoder = new TextDecoder("utf-8");
  let totalUncompressed = 0;
  let offset = centralOffset;
  for (let index = 0; index < entryCount; index += 1) {
    if (readU32(view, offset) !== 0x02014b50) throw new ContactImportFileError("INVALID_EXCEL_FILE", "The Excel file directory is damaged.");
    const flags = readU16(view, offset + 8);
    const method = readU16(view, offset + 10);
    const compressedSize = readU32(view, offset + 20);
    const uncompressedSize = readU32(view, offset + 24);
    const nameLength = readU16(view, offset + 28);
    const extraLength = readU16(view, offset + 30);
    const commentLength = readU16(view, offset + 32);
    const localOffset = readU32(view, offset + 42);
    const nextOffset = offset + 46 + nameLength + extraLength + commentLength;
    if ((flags & 1) !== 0 || (method !== 0 && method !== 8) || compressedSize === 0xffffffff || uncompressedSize === 0xffffffff || nextOffset > bytes.byteLength) {
      throw new ContactImportFileError("UNSAFE_EXCEL_FILE", "This Excel file uses an unsupported or protected format.");
    }
    const name = decoder.decode(bytes.subarray(offset + 46, offset + 46 + nameLength)).replace(/\\/g, "/");
    if (!name || name.startsWith("/") || name.includes("../") || /^[A-Za-z]:/.test(name)) {
      throw new ContactImportFileError("UNSAFE_EXCEL_FILE", "This Excel file contains an unsafe internal path.");
    }
    totalUncompressed += uncompressedSize;
    if (uncompressedSize > CONTACT_IMPORT_MAX_UNCOMPRESSED_BYTES || totalUncompressed > CONTACT_IMPORT_MAX_UNCOMPRESSED_BYTES) {
      throw new ContactImportFileError("UNSAFE_EXCEL_FILE", "This Excel file expands beyond the safe import limit.");
    }
    entries.push({ name, method, compressedSize, uncompressedSize, localOffset });
    offset = nextOffset;
  }

  const result = new Map<string, Uint8Array>();
  for (const entry of entries) {
    if (entry.name.endsWith("/")) continue;
    if (readU32(view, entry.localOffset) !== 0x04034b50) throw new ContactImportFileError("INVALID_EXCEL_FILE", "The Excel file contains a damaged entry.");
    const nameLength = readU16(view, entry.localOffset + 26);
    const extraLength = readU16(view, entry.localOffset + 28);
    const dataStart = entry.localOffset + 30 + nameLength + extraLength;
    const dataEnd = dataStart + entry.compressedSize;
    if (dataStart < 0 || dataEnd > bytes.byteLength) throw new ContactImportFileError("INVALID_EXCEL_FILE", "The Excel file contains an incomplete entry.");
    const compressed = bytes.subarray(dataStart, dataEnd);
    let uncompressed: Uint8Array;
    try {
      uncompressed = entry.method === 0
        ? compressed.slice()
        : new Uint8Array(inflateRawSync(compressed, { maxOutputLength: CONTACT_IMPORT_MAX_UNCOMPRESSED_BYTES }));
    } catch {
      throw new ContactImportFileError("INVALID_EXCEL_FILE", "The Excel file could not be opened.");
    }
    if (uncompressed.byteLength !== entry.uncompressedSize) {
      throw new ContactImportFileError("INVALID_EXCEL_FILE", "The Excel file contains an incomplete entry.");
    }
    result.set(entry.name, uncompressed);
  }
  return result;
}

function workbookText(entries: Map<string, Uint8Array>, name: string, required = true): string {
  const bytes = entries.get(name);
  if (!bytes) {
    if (required) throw new ContactImportFileError("INVALID_EXCEL_FILE", "The Excel workbook is missing required information.");
    return "";
  }
  return new TextDecoder("utf-8").decode(bytes);
}

function sharedStrings(xml: string): string[] {
  if (!xml) return [];
  const values: string[] = [];
  for (const match of xml.matchAll(/<(?:[\w.-]+:)?si\b[^>]*>([\s\S]*?)<\/(?:[\w.-]+:)?si>/gi)) {
    const parts = [...match[1].matchAll(/<(?:[\w.-]+:)?t\b[^>]*>([\s\S]*?)<\/(?:[\w.-]+:)?t>/gi)].map(part => decodeXml(part[1]));
    values.push(parts.join(""));
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
      if (/<(?:[\w.-]+:)?f\b/i.test(body)) {
        value = FORMULA_SENTINEL;
      } else if (type === "inlineStr") {
        value = [...body.matchAll(/<(?:[\w.-]+:)?t\b[^>]*>([\s\S]*?)<\/(?:[\w.-]+:)?t>/gi)].map(part => decodeXml(part[1])).join("");
      } else {
        const rawValue = body.match(/<(?:[\w.-]+:)?v\b[^>]*>([\s\S]*?)<\/(?:[\w.-]+:)?v>/i)?.[1] ?? "";
        if (type === "s") {
          const sharedIndex = Number.parseInt(rawValue, 10);
          value = Number.isFinite(sharedIndex) ? strings[sharedIndex] ?? "" : "";
        } else if (type === "b") {
          value = rawValue === "1" ? "TRUE" : "FALSE";
        } else {
          value = decodeXml(rawValue);
        }
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
  const sheet = sheets.find(candidate => normalizeHeader(candidate.name) === "contacts") ?? sheets[0];
  if (!sheet) throw new ContactImportFileError("INVALID_EXCEL_FILE", "The Excel workbook does not contain a worksheet.");

  const targets = new Map<string, string>();
  for (const match of relationships.matchAll(/<(?:[\w.-]+:)?Relationship\b([^>]*)\/?\s*>/gi)) {
    const id = xmlAttribute(match[1], "Id");
    const target = xmlAttribute(match[1], "Target");
    if (id && target) targets.set(id, target);
  }
  const target = targets.get(sheet.relationshipId);
  if (!target) throw new ContactImportFileError("INVALID_EXCEL_FILE", "The Contacts worksheet could not be found.");
  const normalizedTarget = target.replace(/\\/g, "/").replace(/^\//, "");
  const path = normalizedTarget.startsWith("xl/") ? normalizedTarget : `xl/${normalizedTarget.replace(/^\.\//, "")}`;
  const strings = sharedStrings(workbookText(entries, "xl/sharedStrings.xml", false));
  return { sheetName: sheet.name, rows: parseWorksheet(workbookText(entries, path), strings) };
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
      if (character === '"' && source[index + 1] === '"') {
        cell += '"';
        index += 1;
      } else if (character === '"') {
        quoted = false;
      } else {
        cell += character;
      }
      continue;
    }
    if (character === '"' && !cell) quoted = true;
    else if (character === ",") {
      cells.push(cell);
      cell = "";
    } else if (character === "\n") {
      cells.push(cell.replace(/\r$/, ""));
      rows.push({ rowNumber, cells });
      cells = [];
      cell = "";
      rowNumber += 1;
    } else {
      cell += character;
    }
  }
  if (quoted) throw new ContactImportFileError("INVALID_CSV", "The CSV contains an unfinished quoted cell.");
  return rows;
}

function excelDate(value: string): string {
  if (!/^\d+(?:\.\d+)?$/.test(value)) return value;
  const serial = Number(value);
  if (!Number.isFinite(serial) || serial < 1 || serial > 2_958_465) return value;
  const milliseconds = Math.round((serial - 25_569) * 86_400_000);
  const date = new Date(milliseconds);
  return Number.isNaN(date.getTime()) ? value : date.toISOString().slice(0, 10);
}

function rowsFromMatrix(matrix: MatrixRow[], fileType: "xlsx" | "csv"): Omit<ParsedContactImport, "fileType" | "sheetName"> {
  let headerRow: MatrixRow | undefined;
  let columnMap = new Map<number, ContactColumnKey>();
  for (const row of matrix.filter(candidate => candidate.rowNumber <= 20)) {
    const candidateMap = new Map<number, ContactColumnKey>();
    const keys = new Set<ContactColumnKey>();
    row.cells.forEach((cell, index) => {
      const key = headerAliases.get(normalizeHeader(cell ?? ""));
      if (key) {
        if (keys.has(key)) throw new ContactImportFileError("DUPLICATE_COLUMNS", `The spreadsheet has more than one ${CONTACT_COLUMNS.find(column => column.key === key)?.aliases[0] ?? key} column.`);
        candidateMap.set(index, key);
        keys.add(key);
      }
    });
    if (keys.has("firstName") && keys.has("lastName") && keys.has("email") && keys.has("phone")) {
      headerRow = row;
      columnMap = candidateMap;
      break;
    }
  }
  if (!headerRow) {
    throw new ContactImportFileError("HEADERS_NOT_FOUND", "Keep the template headers unchanged, including First Name, Last Name, Email, and Cell Phone.");
  }

  const rows: ParsedContactImportRow[] = [];
  for (const row of matrix) {
    if (row.rowNumber <= headerRow.rowNumber || !row.cells.some(cell => String(cell ?? "").trim())) continue;
    const values = Object.fromEntries(CONTACT_COLUMNS.map(column => [column.key, ""])) as Record<ContactColumnKey, string>;
    for (const [index, key] of columnMap) {
      const raw = String(row.cells[index] ?? "").normalize("NFKC").replace(/\r\n?/g, "\n").trim();
      values[key] = key === "lastContacted" && fileType === "xlsx" ? excelDate(raw) : raw;
    }
    rows.push({ rowNumber: row.rowNumber, values });
    if (rows.length > CONTACT_IMPORT_MAX_ROWS) {
      throw new ContactImportFileError("TOO_MANY_ROWS", `Import no more than ${CONTACT_IMPORT_MAX_ROWS} contacts at one time.`);
    }
  }
  return { headerRowNumber: headerRow.rowNumber, rows };
}

export function parseContactImportFile(fileName: string, bytes: Uint8Array): ParsedContactImport {
  if (!bytes.byteLength) throw new ContactImportFileError("EMPTY_FILE", "Choose a spreadsheet that contains contact rows.");
  if (bytes.byteLength > CONTACT_IMPORT_MAX_FILE_BYTES) {
    throw new ContactImportFileError("FILE_TOO_LARGE", "Choose a spreadsheet smaller than 2 MB.", 413);
  }
  const extension = fileName.toLocaleLowerCase("en-US").split(".").pop() ?? "";
  if (extension === "csv") {
    const parsed = rowsFromMatrix(parseCsv(new TextDecoder("utf-8").decode(bytes)), "csv");
    return { fileType: "csv", sheetName: "CSV", ...parsed };
  }
  if (extension !== "xlsx") throw new ContactImportFileError("UNSUPPORTED_FILE", "Choose the Hope Sojourns Excel template (.xlsx) or a CSV version of it.", 415);
  if (bytes[0] !== 0x50 || bytes[1] !== 0x4b) throw new ContactImportFileError("INVALID_EXCEL_FILE", "Choose a valid Excel .xlsx file.");
  const worksheet = resolveWorksheet(unzipWorkbook(bytes));
  const parsed = rowsFromMatrix(worksheet.rows, "xlsx");
  return { fileType: "xlsx", sheetName: worksheet.sheetName, ...parsed };
}

function cleanLine(value: string, maximum: number, label: string, required: boolean, errors: string[]): string | null {
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

function cleanMessage(value: string, maximum: number, label: string, errors: string[]): string | null {
  const cleaned = value.normalize("NFKC").replace(/\r\n?/g, "\n").trim();
  if (!cleaned) return null;
  if (cleaned.length > maximum || /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/.test(cleaned)) {
    errors.push(`${label} must use ${maximum.toLocaleString("en-US")} characters or fewer.`);
    return null;
  }
  return cleaned;
}

function splitList(value: string): string[] {
  const unique = new Map<string, string>();
  for (const item of value.split(/[;\n]+/)) {
    const cleaned = item.normalize("NFKC").replace(/\s+/g, " ").trim();
    if (cleaned) unique.set(normalizeHeader(cleaned), cleaned);
  }
  return [...unique.values()];
}

function choiceList(value: string, lookup: Map<string, string>, label: string, maximum: number, errors: string[]): string[] {
  const result: string[] = [];
  for (const item of splitList(value)) {
    const selected = lookup.get(normalizeHeader(item)) ?? lookup.get(item.toLocaleLowerCase("en-US"));
    if (!selected) errors.push(`${label} “${item}” is not on the allowed list.`);
    else if (!result.includes(selected)) result.push(selected);
  }
  if (result.length > maximum) errors.push(`${label} may contain no more than ${maximum} choices.`);
  return result;
}

function cleanDate(value: string, errors: string[]): string | null {
  if (!value) return null;
  let isoDate = value;
  const usDate = value.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (usDate) isoDate = `${usDate[3]}-${usDate[1].padStart(2, "0")}-${usDate[2].padStart(2, "0")}`;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(isoDate)) {
    errors.push("Last Contacted must be a real date, such as 08/19/2026.");
    return null;
  }
  const date = new Date(`${isoDate}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== isoDate) {
    errors.push("Last Contacted must be a real date, such as 08/19/2026.");
    return null;
  }
  return date.toISOString();
}

function cleanWebsite(value: string, errors: string[]): string | null {
  if (!value) return null;
  if (value.length > 300) {
    errors.push("Website must use 300 characters or fewer.");
    return null;
  }
  try {
    const url = new URL(value);
    if (url.protocol !== "http:" && url.protocol !== "https:") throw new Error("Unsupported protocol");
    return url.toString();
  } catch {
    errors.push("Website must begin with http:// or https://.");
    return null;
  }
}

function cleanTrips(value: string, opportunities: ContactImportOpportunity[], errors: string[]): string[] {
  const lookup = new Map<string, ContactImportOpportunity | null>();
  for (const opportunity of opportunities) {
    for (const key of [opportunity.slug, opportunity.title, opportunity.location ? `${opportunity.title} ${opportunity.location}` : ""].filter(Boolean)) {
      const normalized = normalizeHeader(key);
      if (!lookup.has(normalized)) lookup.set(normalized, opportunity);
      else if (lookup.get(normalized)?.id !== opportunity.id) lookup.set(normalized, null);
    }
  }
  const result: string[] = [];
  for (const item of splitList(value)) {
    const opportunity = lookup.get(normalizeHeader(item));
    if (opportunity === undefined) errors.push(`Trip Code “${item}” was not found. Use a code from the Lists worksheet.`);
    else if (opportunity === null) errors.push(`Trip “${item}” is ambiguous. Use its Trip Code from the Lists worksheet.`);
    else if (!result.includes(opportunity.id)) result.push(opportunity.id);
  }
  if (result.length > 100) errors.push("Trip Codes may contain no more than 100 trips.");
  return result;
}

export function validateContactImportRow(row: ParsedContactImportRow, opportunities: ContactImportOpportunity[]): ValidatedContactImportRow {
  const errors: string[] = [];
  const warnings: string[] = [];
  const values = row.values;
  const formulaColumns = CONTACT_COLUMNS.filter(column => values[column.key] === FORMULA_SENTINEL).map(column => column.aliases[0]);
  if (formulaColumns.length) errors.push(`Replace formulas with values in: ${formulaColumns.join(", ")}.`);

  const firstName = cleanLine(values.firstName, 80, "First Name", true, errors) ?? "";
  const lastName = cleanLine(values.lastName, 80, "Last Name", true, errors) ?? "";
  const email = cleanLine(values.email, 254, "Email", false, errors) ?? "";
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) errors.push("Email is not a valid email address.");
  const phone = cleanLine(values.phone, 40, "Cell Phone", false, errors);
  if (phone && !normalizeImportPhone(phone)) errors.push("Cell Phone must contain 7 to 18 digits.");
  if (!email && !phone) errors.push("Enter an Email or Cell Phone number.");

  const rawContactId = values.contactId.trim();
  const contactId = rawContactId || null;
  if (contactId && !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(contactId)) {
    errors.push("Contact ID is not valid. Leave it blank for a new contact.");
  }

  let contactPreference: "email" | "phone" | null = null;
  if (values.contactPreference) {
    const preference = normalizeHeader(values.contactPreference);
    if (["email", "email address"].includes(preference)) contactPreference = "email";
    else if (["phone", "phone call", "cell", "cell phone", "text"].includes(preference)) contactPreference = "phone";
    else errors.push("Preferred Contact must be Email or Phone.");
  }
  if (contactPreference === "email" && !email && phone) {
    contactPreference = "phone";
    warnings.push("Preferred Contact changed to Phone because no email was provided.");
  } else if (contactPreference === "phone" && !phone && email) {
    contactPreference = "email";
    warnings.push("Preferred Contact changed to Email because no phone was provided.");
  }

  let contactStatus: "active" | "inactive" | null = null;
  if (values.contactStatus) {
    const status = normalizeHeader(values.contactStatus);
    if (status === "active" || status === "inactive") contactStatus = status;
    else errors.push("Contact Status must be Active or Inactive.");
  }

  const languages = splitList(values.languages).map(language => cleanLine(language, 60, "Language", false, errors)).filter((language): language is string => Boolean(language));
  if (languages.length > 20) errors.push("Languages Spoken may contain no more than 20 languages.");

  const input: ContactImportInput = {
    contactId,
    firstName,
    lastName,
    preferredName: cleanLine(values.preferredName, 80, "Preferred Name", false, errors),
    email,
    phone,
    contactPreference,
    contactStatus,
    contactTypes: choiceList(values.contactTypes, CONTACT_TYPE_LOOKUP, "Contact Type", 8, errors),
    areas: choiceList(values.areas, AREA_LOOKUP, "Hope Sojourns Area", 3, errors),
    organization: cleanLine(values.organization, 160, "Organization", false, errors),
    website: cleanWebsite(values.website, errors),
    addressLine1: cleanLine(values.addressLine1, 160, "Address Line 1", false, errors),
    addressLine2: cleanLine(values.addressLine2, 160, "Address Line 2", false, errors),
    city: cleanLine(values.city, 100, "City", false, errors),
    region: cleanLine(values.region, 100, "State / Province / Region", false, errors),
    postalCode: cleanLine(values.postalCode, 30, "Postal Code", false, errors),
    country: cleanLine(values.country, 100, "Country", false, errors),
    languages,
    tripIds: cleanTrips(values.tripCodes, opportunities, errors),
    fieldOfStudy: cleanLine(values.fieldOfStudy, 160, "School / Field / Specialty", false, errors),
    lastContactedAt: cleanDate(values.lastContacted, errors),
    notes: cleanMessage(values.notes, 5000, "Notes", errors),
  };
  return { rowNumber: row.rowNumber, input: errors.length ? null : input, errors: [...new Set(errors)], warnings: [...new Set(warnings)] };
}
