import { inflateRawSync } from "node:zlib";

export const SPREADSHEET_MAX_FILE_BYTES = 3 * 1024 * 1024;
const SPREADSHEET_MAX_UNCOMPRESSED_BYTES = 24 * 1024 * 1024;
const SPREADSHEET_MAX_ZIP_ENTRIES = 220;
export const SPREADSHEET_FORMULA_SENTINEL = "__HOPE_SOJOURNS_FORMULA__";

export type SpreadsheetMatrixRow = { rowNumber: number; cells: string[] };
export type SpreadsheetSheet = { name: string; rows: SpreadsheetMatrixRow[] };

export class SpreadsheetFileError extends Error {
  constructor(readonly code: string, message: string, readonly status = 422) {
    super(message);
  }
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
  if (offset < 0 || offset + 2 > view.byteLength) throw new SpreadsheetFileError("INVALID_EXCEL_FILE", "The Excel file is incomplete or damaged.");
  return view.getUint16(offset, true);
}

function readU32(view: DataView, offset: number): number {
  if (offset < 0 || offset + 4 > view.byteLength) throw new SpreadsheetFileError("INVALID_EXCEL_FILE", "The Excel file is incomplete or damaged.");
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
  if (eocdOffset < 0) throw new SpreadsheetFileError("INVALID_EXCEL_FILE", "Choose a valid Excel .xlsx file.");

  const entryCount = readU16(view, eocdOffset + 10);
  const centralSize = readU32(view, eocdOffset + 12);
  const centralOffset = readU32(view, eocdOffset + 16);
  if (!entryCount || entryCount > SPREADSHEET_MAX_ZIP_ENTRIES || centralOffset + centralSize > bytes.byteLength) {
    throw new SpreadsheetFileError("UNSAFE_EXCEL_FILE", "This Excel file is too complex to import safely.");
  }

  const entries: Array<{ name: string; method: number; compressedSize: number; uncompressedSize: number; localOffset: number }> = [];
  const decoder = new TextDecoder("utf-8");
  let totalUncompressed = 0;
  let offset = centralOffset;
  for (let index = 0; index < entryCount; index += 1) {
    if (readU32(view, offset) !== 0x02014b50) throw new SpreadsheetFileError("INVALID_EXCEL_FILE", "The Excel file directory is damaged.");
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
      throw new SpreadsheetFileError("UNSAFE_EXCEL_FILE", "This Excel file uses an unsupported or protected format.");
    }
    const name = decoder.decode(bytes.subarray(offset + 46, offset + 46 + nameLength)).replace(/\\/g, "/");
    if (!name || name.startsWith("/") || name.includes("../") || /^[A-Za-z]:/.test(name)) {
      throw new SpreadsheetFileError("UNSAFE_EXCEL_FILE", "This Excel file contains an unsafe internal path.");
    }
    totalUncompressed += uncompressedSize;
    if (uncompressedSize > SPREADSHEET_MAX_UNCOMPRESSED_BYTES || totalUncompressed > SPREADSHEET_MAX_UNCOMPRESSED_BYTES) {
      throw new SpreadsheetFileError("UNSAFE_EXCEL_FILE", "This Excel file expands beyond the safe import limit.");
    }
    entries.push({ name, method, compressedSize, uncompressedSize, localOffset });
    offset = nextOffset;
  }

  const result = new Map<string, Uint8Array>();
  for (const entry of entries) {
    if (entry.name.endsWith("/")) continue;
    if (readU32(view, entry.localOffset) !== 0x04034b50) throw new SpreadsheetFileError("INVALID_EXCEL_FILE", "The Excel file contains a damaged entry.");
    const nameLength = readU16(view, entry.localOffset + 26);
    const extraLength = readU16(view, entry.localOffset + 28);
    const dataStart = entry.localOffset + 30 + nameLength + extraLength;
    const dataEnd = dataStart + entry.compressedSize;
    if (dataStart < 0 || dataEnd > bytes.byteLength) throw new SpreadsheetFileError("INVALID_EXCEL_FILE", "The Excel file contains an incomplete entry.");
    const compressed = bytes.subarray(dataStart, dataEnd);
    let uncompressed: Uint8Array;
    try {
      uncompressed = entry.method === 0
        ? compressed.slice()
        : new Uint8Array(inflateRawSync(compressed, { maxOutputLength: SPREADSHEET_MAX_UNCOMPRESSED_BYTES }));
    } catch {
      throw new SpreadsheetFileError("INVALID_EXCEL_FILE", "The Excel file could not be opened.");
    }
    if (uncompressed.byteLength !== entry.uncompressedSize) throw new SpreadsheetFileError("INVALID_EXCEL_FILE", "The Excel file contains an incomplete entry.");
    result.set(entry.name, uncompressed);
  }
  return result;
}

function workbookText(entries: Map<string, Uint8Array>, name: string, required = true): string {
  const bytes = entries.get(name);
  if (!bytes) {
    if (required) throw new SpreadsheetFileError("INVALID_EXCEL_FILE", "The Excel workbook is missing required information.");
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

function parseWorksheet(xml: string, strings: string[]): SpreadsheetMatrixRow[] {
  const rows: SpreadsheetMatrixRow[] = [];
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
        value = SPREADSHEET_FORMULA_SENTINEL;
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

export function normalizeSpreadsheetLabel(value: string): string {
  return value.normalize("NFKC").replace(/\*/g, "").replace(/[^\p{L}\p{N}]+/gu, " ").trim().toLocaleLowerCase("en-US");
}

export function excelDateValue(value: string): string {
  if (!/^\d+(?:\.\d+)?$/.test(value)) return value;
  const serial = Number(value);
  if (!Number.isFinite(serial) || serial < 1 || serial > 2_958_465) return value;
  const date = new Date(Math.round((serial - 25_569) * 86_400_000));
  return Number.isNaN(date.getTime()) ? value : date.toISOString().slice(0, 10);
}

export function readSpreadsheet(fileName: string, bytes: Uint8Array): SpreadsheetSheet[] {
  if (!bytes.byteLength) throw new SpreadsheetFileError("EMPTY_FILE", "Choose a spreadsheet that contains trip setup rows.");
  if (bytes.byteLength > SPREADSHEET_MAX_FILE_BYTES) throw new SpreadsheetFileError("FILE_TOO_LARGE", "Choose a spreadsheet smaller than 3 MB.", 413);
  if (!fileName.toLocaleLowerCase("en-US").endsWith(".xlsx")) {
    throw new SpreadsheetFileError("UNSUPPORTED_FILE", "Choose the Hope Sojourns Excel template (.xlsx).", 415);
  }
  if (bytes[0] !== 0x50 || bytes[1] !== 0x4b) throw new SpreadsheetFileError("INVALID_EXCEL_FILE", "Choose a valid Excel .xlsx file.");

  const entries = unzipWorkbook(bytes);
  const workbook = workbookText(entries, "xl/workbook.xml");
  const relationships = workbookText(entries, "xl/_rels/workbook.xml.rels");
  const strings = sharedStrings(workbookText(entries, "xl/sharedStrings.xml", false));
  const targets = new Map<string, string>();
  for (const match of relationships.matchAll(/<(?:[\w.-]+:)?Relationship\b([^>]*)\/?\s*>/gi)) {
    const id = xmlAttribute(match[1], "Id");
    const target = xmlAttribute(match[1], "Target");
    if (id && target) targets.set(id, target);
  }

  const sheets: SpreadsheetSheet[] = [];
  for (const match of workbook.matchAll(/<(?:[\w.-]+:)?sheet\b([^>]*)\/?\s*>/gi)) {
    const name = xmlAttribute(match[1], "name") ?? "";
    const relationshipId = xmlAttribute(match[1], "r:id") ?? "";
    const target = targets.get(relationshipId);
    if (!name || !target) continue;
    const normalizedTarget = target.replace(/\\/g, "/").replace(/^\//, "");
    if (normalizedTarget.includes("../")) throw new SpreadsheetFileError("UNSAFE_EXCEL_FILE", "This Excel file contains an unsafe worksheet path.");
    const path = normalizedTarget.startsWith("xl/") ? normalizedTarget : `xl/${normalizedTarget.replace(/^\.\//, "")}`;
    const xml = workbookText(entries, path);
    sheets.push({ name, rows: parseWorksheet(xml, strings) });
  }
  if (!sheets.length) throw new SpreadsheetFileError("INVALID_EXCEL_FILE", "The Excel workbook does not contain any worksheets.");
  return sheets;
}
