import { zipOfficeArchive } from "./office-archive";

export type TripWorkbookSheet = {
  name: string;
  purpose: string;
  guidance?: string;
  headers: string[];
  rows: Array<Array<string | number | null>>;
};

function xml(value: unknown): string {
  return String(value ?? "")
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "")
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;");
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

function cellXml(value: string | number | null, reference: string, style: number): string {
  if (value === null || value === "") return `<c r="${reference}" s="${style}"/>`;
  if (typeof value === "number") return `<c r="${reference}" s="${style}"><v>${value}</v></c>`;
  const preserve = /^\s|\s$|\n/.test(value) ? ' xml:space="preserve"' : "";
  return `<c r="${reference}" s="${style}" t="inlineStr"><is><t${preserve}>${xml(value)}</t></is></c>`;
}

function worksheetXml(sheet: TripWorkbookSheet): string {
  const columns = sheet.headers.map((header, index) => {
    const wider = /notes|content|description|reason|address|organization name/i.test(header);
    const narrow = /status|date|amount|visible|type|role|ref$/i.test(header);
    const width = wider ? 30 : narrow ? 18 : 23;
    return `<col min="${index + 1}" max="${index + 1}" width="${width}" customWidth="1"/>`;
  }).join("");
  const lastColumn = columnName(Math.max(0, sheet.headers.length - 1));
  const title = sheet.name === "Instructions" ? "Hope Sojourns Trip Workbook" : `Hope Sojourns - ${sheet.name}`;
  const leadingRows: Array<Array<string | number | null>> = [
    [title],
    [sheet.purpose],
    [sheet.guidance ?? "Enter one item per row. Keep Record ID and Original Updated At unchanged when editing an exported workbook."],
    sheet.headers,
  ];
  const rows = [...leadingRows, ...sheet.rows];
  const metadataStart = ["Original Role", "Record ID"]
    .map(header => sheet.headers.indexOf(header))
    .filter(index => index >= 0)
    .sort((left, right) => left - right)[0] ?? sheet.headers.length;
  const rowXml = rows.map((row, rowIndex) => {
    const style = rowIndex === 0 ? 1 : rowIndex === 1 ? 2 : rowIndex === 2 ? 3 : rowIndex === 3 ? 4 : 5;
    const cells = Array.from({ length: sheet.headers.length }, (_, columnIndex) =>
      cellXml(row[columnIndex] ?? null, `${columnName(columnIndex)}${rowIndex + 1}`, rowIndex >= 4 && columnIndex >= metadataStart ? 2 : style),
    ).join("");
    const height = rowIndex === 0 ? 34 : rowIndex < 3 ? 30 : rowIndex === 3 ? 34 : 24;
    return `<row r="${rowIndex + 1}" ht="${height}" customHeight="1">${cells}</row>`;
  }).join("");
  const mergeCells = `<mergeCells count="3"><mergeCell ref="A1:${lastColumn}1"/><mergeCell ref="A2:${lastColumn}2"/><mergeCell ref="A3:${lastColumn}3"/></mergeCells>`;
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetViews><sheetView workbookViewId="0" showGridLines="0"><pane ySplit="4" topLeftCell="A5" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews><cols>${columns}</cols><sheetData>${rowXml}</sheetData>${mergeCells}<autoFilter ref="A4:${lastColumn}${Math.max(4, rows.length)}"/></worksheet>`;
}

export function buildTripWorkbook(sheets: TripWorkbookSheet[]): Uint8Array {
  const encoder = new TextEncoder();
  const contentOverrides = sheets.map((_, index) =>
    `<Override PartName="/xl/worksheets/sheet${index + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`,
  ).join("");
  const workbookSheets = sheets.map((sheet, index) =>
    `<sheet name="${xml(sheet.name)}" sheetId="${index + 1}" r:id="rId${index + 1}"/>`,
  ).join("");
  const relationships = sheets.map((_, index) =>
    `<Relationship Id="rId${index + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${index + 1}.xml"/>`,
  ).join("");
  const files = [
    { name: "[Content_Types].xml", bytes: encoder.encode(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>${contentOverrides}<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>`) },
    { name: "_rels/.rels", bytes: encoder.encode(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`) },
    { name: "xl/workbook.xml", bytes: encoder.encode(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>${workbookSheets}</sheets></workbook>`) },
    { name: "xl/_rels/workbook.xml.rels", bytes: encoder.encode(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${relationships}<Relationship Id="rId${sheets.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`) },
    { name: "xl/styles.xml", bytes: encoder.encode(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><fonts count="4"><font><sz val="10"/><name val="Aptos"/><color rgb="FF15362F"/></font><font><b/><sz val="18"/><name val="Aptos"/><color rgb="FFFFFFFF"/></font><font><i/><sz val="10"/><name val="Aptos"/><color rgb="FF15362F"/></font><font><b/><sz val="10"/><name val="Aptos"/><color rgb="FFFFFFFF"/></font></fonts><fills count="6"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FF173F35"/></patternFill></fill><fill><patternFill patternType="solid"><fgColor rgb="FFEAF2EF"/></patternFill></fill><fill><patternFill patternType="solid"><fgColor rgb="FF2C6658"/></patternFill></fill><fill><patternFill patternType="solid"><fgColor rgb="FFFFF7DD"/></patternFill></fill></fills><borders count="2"><border><left/><right/><top/><bottom/><diagonal/></border><border><left style="thin"><color rgb="FFC8D5D0"/></left><right style="thin"><color rgb="FFC8D5D0"/></right><top style="thin"><color rgb="FFC8D5D0"/></top><bottom style="thin"><color rgb="FFC8D5D0"/></bottom><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="6"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1"/><xf numFmtId="0" fontId="2" fillId="3" borderId="0" xfId="0" applyFont="1" applyFill="1" applyAlignment="1"><alignment wrapText="1" vertical="center"/></xf><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0" applyAlignment="1"><alignment wrapText="1" vertical="center"/></xf><xf numFmtId="0" fontId="3" fillId="4" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment wrapText="1" vertical="center"/></xf><xf numFmtId="0" fontId="0" fillId="5" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment wrapText="1" vertical="top"/></xf></cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>`) },
    ...sheets.map((sheet, index) => ({ name: `xl/worksheets/sheet${index + 1}.xml`, bytes: encoder.encode(worksheetXml(sheet)) })),
  ];
  return zipOfficeArchive(files);
}
