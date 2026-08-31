import { zipOfficeArchive } from "./office-archive";

export type LedgerWorkbookRow = {
  id: string;
  transactionDate: string;
  entryType: string;
  paymentType: string;
  expenseCategory: string | null;
  amount: number;
  name: string | null;
  personId: string | null;
  budgetCategory: string;
  note: string | null;
  sourceType: string;
  sourceFileName: string | null;
  sourceRowNumber: number | null;
  currency: string;
  gross: number | null;
  fee: number | null;
  net: number | null;
  createdAt: string;
};

function xml(value: unknown): string {
  return String(value ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;");
}

function columnName(index: number): string {
  let current = index + 1;
  let result = "";
  while (current > 0) {
    const remainder = (current - 1) % 26;
    result = String.fromCharCode(65 + remainder) + result;
    current = Math.floor((current - 1) / 26);
  }
  return result;
}

function excelSerial(value: string): number | null {
  const date = new Date(/^\d{4}-\d{2}-\d{2}$/.test(value) ? `${value}T00:00:00.000Z` : value);
  return Number.isNaN(date.getTime()) ? null : date.getTime() / 86_400_000 + 25_569;
}

type Cell = { value: string | number | null; style?: number; numeric?: boolean };

function worksheetXml(rows: Cell[][], widths: number[], filter = true): string {
  const rowXml = rows.map((row, rowIndex) => {
    const cells = row.map((cell, columnIndex) => {
      const reference = `${columnName(columnIndex)}${rowIndex + 1}`;
      const style = cell.style === undefined ? "" : ` s="${cell.style}"`;
      if (cell.value === null || cell.value === "") return `<c r="${reference}"${style}/>`;
      if (cell.numeric || typeof cell.value === "number") return `<c r="${reference}"${style}><v>${Number(cell.value)}</v></c>`;
      const text = String(cell.value);
      const preserve = /^\s|\s$|\n/.test(text) ? ' xml:space="preserve"' : "";
      return `<c r="${reference}" t="inlineStr"${style}><is><t${preserve}>${xml(text)}</t></is></c>`;
    }).join("");
    return `<row r="${rowIndex + 1}">${cells}</row>`;
  }).join("");
  const lastColumn = columnName(Math.max(0, rows[0]?.length - 1));
  const columns = widths.map((width, index) => `<col min="${index + 1}" max="${index + 1}" width="${width}" customWidth="1"/>`).join("");
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews><cols>${columns}</cols><sheetData>${rowXml}</sheetData>${filter ? `<autoFilter ref="A1:${lastColumn}${Math.max(1, rows.length)}"/>` : ""}</worksheet>`;
}

export function buildLedgerWorkbook(entries: LedgerWorkbookRow[]): Uint8Array {
  const headers = [
    "ID", "Date", "Income/Expense", "Payment Type", "Expense Category", "Amount", "Name", "Contact ID",
    "Budget Category", "Note", "Source", "Source File", "Source Row", "Currency", "Gross", "Fee", "Net", "Created At",
  ];
  const ledgerRows: Cell[][] = [headers.map(value => ({ value, style: 3 }))];
  for (const entry of entries) {
    const date = excelSerial(entry.transactionDate);
    ledgerRows.push([
      { value: entry.id },
      date === null ? { value: entry.transactionDate } : { value: date, style: 1, numeric: true },
      { value: entry.entryType === "income" ? "Income" : "Expense" },
      { value: entry.paymentType },
      { value: entry.expenseCategory },
      { value: entry.amount, style: 2, numeric: true },
      { value: entry.name },
      { value: entry.personId },
      { value: entry.budgetCategory },
      { value: entry.note },
      { value: entry.sourceType },
      { value: entry.sourceFileName },
      { value: entry.sourceRowNumber, numeric: entry.sourceRowNumber !== null },
      { value: entry.currency },
      { value: entry.gross, style: 2, numeric: entry.gross !== null },
      { value: entry.fee, style: 2, numeric: entry.fee !== null },
      { value: entry.net, style: 2, numeric: entry.net !== null },
      { value: entry.createdAt },
    ]);
  }

  const unique = (values: Array<string | null>): string[] => [...new Set(values.filter((value): value is string => Boolean(value)).map(value => value.trim()))].sort((a, b) => a.localeCompare(b, "en-US"));
  const payments = unique(entries.map(entry => entry.paymentType));
  const expenses = unique(entries.map(entry => entry.expenseCategory));
  const budgets = unique(entries.map(entry => entry.budgetCategory));
  const categoryRows: Cell[][] = [[{ value: "Payment Types", style: 3 }, { value: "Expense Categories", style: 3 }, { value: "Budget Categories", style: 3 }]];
  const categoryCount = Math.max(payments.length, expenses.length, budgets.length, 1);
  for (let index = 0; index < categoryCount; index += 1) categoryRows.push([{ value: payments[index] ?? null }, { value: expenses[index] ?? null }, { value: budgets[index] ?? null }]);

  const encoder = new TextEncoder();
  const files = [
    { name: "[Content_Types].xml", bytes: encoder.encode(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/worksheets/sheet2.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>`) },
    { name: "_rels/.rels", bytes: encoder.encode(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`) },
    { name: "xl/workbook.xml", bytes: encoder.encode(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Ledger" sheetId="1" r:id="rId1"/><sheet name="Categories" sheetId="2" r:id="rId2"/></sheets></workbook>`) },
    { name: "xl/_rels/workbook.xml.rels", bytes: encoder.encode(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet2.xml"/><Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`) },
    { name: "xl/styles.xml", bytes: encoder.encode(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><numFmts count="2"><numFmt numFmtId="164" formatCode="yyyy-mm-dd"/><numFmt numFmtId="165" formatCode="&quot;$&quot;#,##0.00"/></numFmts><fonts count="2"><font><sz val="11"/><name val="Aptos"/></font><font><b/><color rgb="FFFFFFFF"/><sz val="11"/><name val="Aptos"/></font></fonts><fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FF355E4A"/><bgColor indexed="64"/></patternFill></fill></fills><borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="4"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="164" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/><xf numFmtId="165" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/><xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1"/></cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>`) },
    { name: "xl/worksheets/sheet1.xml", bytes: encoder.encode(worksheetXml(ledgerRows, [38, 13, 16, 18, 22, 14, 24, 38, 20, 42, 12, 28, 12, 10, 14, 14, 14, 24])) },
    { name: "xl/worksheets/sheet2.xml", bytes: encoder.encode(worksheetXml(categoryRows, [26, 30, 28], false)) },
  ];
  return zipOfficeArchive(files);
}
