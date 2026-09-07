import {
  SPREADSHEET_FORMULA_SENTINEL,
  SpreadsheetFileError,
  normalizeSpreadsheetLabel,
  type SpreadsheetSheet,
} from "./spreadsheet-reader";

export type TripImportEntity =
  | "person"
  | "ministry"
  | "partner"
  | "member"
  | "content"
  | "account"
  | "cost"
  | "allocation"
  | "charge"
  | "award"
  | "payment"
  | "invite";

export type TripImportRow = {
  entity: TripImportEntity;
  sheet: string;
  rowNumber: number;
  externalKey: string;
  values: Record<string, string>;
};

const SHEETS = new Map<string, TripImportEntity>([
  ["people", "person"],
  ["ministries", "ministry"],
  ["partners", "partner"],
  ["team", "member"],
  ["content", "content"],
  ["accounts", "account"],
  ["budget", "cost"],
  ["allocations", "allocation"],
  ["charges", "charge"],
  ["support", "award"],
  ["payments", "payment"],
  ["invites", "invite"],
]);

export const TRIP_IMPORT_ENTITY_ORDER: TripImportEntity[] = [
  "person", "ministry", "partner", "member", "content", "account", "cost", "allocation", "charge", "award", "payment", "invite",
];

const REQUIRED_HEADERS: Record<TripImportEntity, string[]> = {
  person: ["import ref", "first name", "last name", "email", "contact status"],
  ministry: ["import ref", "organization name", "status"],
  partner: ["import ref", "organization name", "role"],
  member: ["import ref", "person email", "role", "status"],
  content: ["import ref", "content type", "title", "visibility", "publication status"],
  account: ["import ref", "account type", "account name", "financial access", "status"],
  cost: ["import ref", "category name", "description", "expense scope", "settlement route", "payment status"],
  allocation: ["import ref", "budget item ref", "funding source name", "amount", "status"],
  charge: ["import ref", "account ref", "title", "purpose", "amount", "status"],
  award: ["import ref", "account ref", "funding source name", "award type", "amount", "award date", "status"],
  payment: ["import ref", "transaction date", "amount", "purpose", "payment method", "settlement route", "status"],
  invite: ["import ref", "label"],
};

function normalizeImportRef(value: string): string {
  const normalized = value.normalize("NFKC").trim().toLocaleLowerCase("en-US");
  if (!/^[a-z0-9][a-z0-9_.-]{2,79}$/.test(normalized)) {
    throw new SpreadsheetFileError("INVALID_IMPORT_REF", "Each populated row needs a unique Import Ref using 3-80 letters, numbers, periods, underscores, or hyphens.");
  }
  return normalized;
}

export function parseTripImportSheets(sheets: SpreadsheetSheet[], maximumRows = 250): TripImportRow[] {
  const rows: TripImportRow[] = [];
  const keys = new Set<string>();
  for (const sheet of sheets) {
    const entity = SHEETS.get(normalizeSpreadsheetLabel(sheet.name));
    if (!entity) continue;
    const headerRow = sheet.rows.find(row => row.rowNumber === 4);
    if (!headerRow) throw new SpreadsheetFileError("MISSING_HEADERS", `The ${sheet.name} sheet is missing its row 4 headers.`);
    const headers = headerRow.cells.map(normalizeSpreadsheetLabel);
    for (const header of REQUIRED_HEADERS[entity]) {
      if (!headers.includes(header)) throw new SpreadsheetFileError("MISSING_HEADERS", `The ${sheet.name} sheet is missing the \"${header}\" column.`);
    }
    for (const row of sheet.rows.filter(candidate => candidate.rowNumber > 4)) {
      if (row.cells.every(cell => !cell.trim())) continue;
      if (row.cells.some(cell => cell === SPREADSHEET_FORMULA_SENTINEL)) {
        throw new SpreadsheetFileError("FORMULAS_NOT_ALLOWED", `${sheet.name} row ${row.rowNumber} contains a formula. Paste the calculated value instead.`);
      }
      const values: Record<string, string> = {};
      headers.forEach((header, index) => {
        if (header) values[header] = (row.cells[index] ?? "").normalize("NFKC").trim();
      });
      const externalKey = normalizeImportRef(values["import ref"] ?? "");
      const uniqueKey = `${entity}:${externalKey}`;
      if (keys.has(uniqueKey)) throw new SpreadsheetFileError("DUPLICATE_IMPORT_REF", `${sheet.name} contains the Import Ref \"${externalKey}\" more than once.`);
      keys.add(uniqueKey);
      rows.push({ entity, sheet: sheet.name, rowNumber: row.rowNumber, externalKey, values });
      if (rows.length > maximumRows) throw new SpreadsheetFileError("TOO_MANY_ROWS", `Import no more than ${maximumRows} populated rows at a time.`);
    }
  }
  rows.sort((left, right) => TRIP_IMPORT_ENTITY_ORDER.indexOf(left.entity) - TRIP_IMPORT_ENTITY_ORDER.indexOf(right.entity) || left.rowNumber - right.rowNumber);
  return rows;
}
