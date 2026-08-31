import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { buildDocumentBatchZip, mergeContactDocument, type MergeContact } from "../src/document-merge";
import { applyLedgerImportReview, ledgerImportIdentity, parseLedgerImportFile } from "../src/ledger-file";
import { buildLedgerWorkbook } from "../src/ledger-xlsx";
import { unzipOfficeArchive } from "../src/office-archive";

const contact: MergeContact = {
  id: "11111111-2222-4333-8444-555555555555",
  firstName: "Jordan",
  lastName: "Example",
  preferredName: "Jordy",
  organization: null,
  email: "jordan@example.com",
  phone: "972-555-0100",
  addressLine1: "123 Hope Lane",
  addressLine2: null,
  city: "McKinney",
  region: "TX",
  postalCode: "75072",
  country: "USA",
  lastContactedAt: "2026-08-30",
  lastContactedNote: "Thanked for partnership",
};

describe("ledger spreadsheet handling", () => {
  it("parses the Hope Sojourns ledger columns and ignores sequence-only rows", async () => {
    const csv = [
      "Seq #,Date,Income/Expense,Payment Type,Expense Category,Amount,Name,Budget Category,Note",
      "1,8/24/2026,Income,Venmo,Misc,1500,John Gully,General,General fund gift",
      "2,,,,,,,,",
    ].join("\r\n");
    const parsed = parseLedgerImportFile("HSLedger.csv", new TextEncoder().encode(csv));
    expect(parsed.rows).toHaveLength(1);
    expect(parsed.rows[0]?.input).toMatchObject({
      sequence: "1", transactionDate: "2026-08-24", entryType: "income",
      paymentType: "Venmo", expenseCategory: "Misc", amount: 1500,
      name: "John Gully", budgetCategory: "General",
    });
    const first = await ledgerImportIdentity(parsed.rows[0]!);
    const second = await ledgerImportIdentity(parsed.rows[0]!);
    expect(first.importKey).toBe("hsl-seq:1");
    expect(second).toEqual(first);
  });

  it("revalidates edited preview rows and omits rows removed during review", () => {
    const csv = [
      "Seq #,Date,Income/Expense,Payment Type,Expense Category,Amount,Name,Budget Category,Check Number,Note",
      "10,not-a-date,Income,Check,,wrong,Jordan Example,General,445,Gift",
      "11,8/25/2026,Expense,Check,Travel,25,Hotel,Trip,,Room",
    ].join("\r\n");
    const parsed = parseLedgerImportFile("HSLedger.csv", new TextEncoder().encode(csv));
    expect(parsed.rows[0]?.input).toBeNull();
    const reviewed = applyLedgerImportReview(parsed, JSON.stringify([{
      rowNumber: 2,
      sequence: "10",
      transactionDate: "2026-08-24",
      entryType: "income",
      paymentType: "Check",
      expenseCategory: "",
      amount: "100.00",
      name: "Jordan Example",
      budgetCategory: "General",
      checkNumber: "445",
      note: "Corrected gift",
    }]));
    expect(reviewed.rows).toHaveLength(1);
    expect(reviewed.rows[0]?.input).toMatchObject({ transactionDate: "2026-08-24", amount: 100, checkNumber: "445" });
  });

  it("exports a valid Excel workbook that can be imported again", () => {
    const workbook = buildLedgerWorkbook([{
      id: "ledger-1", transactionDate: "2026-08-24", entryType: "income", paymentType: "Venmo",
      expenseCategory: "Misc", amount: 1500, name: "John Gully", personId: null,
      budgetCategory: "General", checkNumber: null, note: "General fund gift", sourceType: "import",
      sourceFileName: "HSLedger.xlsx", sourceRowNumber: 2, currency: "USD",
      gross: null, fee: null, net: null, receiptCount: 2, createdAt: "2026-08-30T12:00:00.000Z",
    }]);
    const entries = unzipOfficeArchive(workbook);
    expect(entries.has("xl/workbook.xml")).toBe(true);
    expect(entries.has("xl/worksheets/sheet1.xml")).toBe(true);
    const sheetXml = new TextDecoder().decode(entries.get("xl/worksheets/sheet1.xml"));
    expect(sheetXml).toContain("Receipt Count");
    const parsed = parseLedgerImportFile("Hope-Sojourns-Ledger.xlsx", workbook);
    expect(parsed.rows[0]?.input).toMatchObject({ transactionDate: "2026-08-24", entryType: "income", amount: 1500 });
  });
});

describe("Word document merge", () => {
  it("fills the branded giving statement and repeats gift rows", async () => {
    const templateUrl = new URL("../../../admin/supplemental-documents/Hope-Sojourns-Giving-Statement-Template.docx", import.meta.url);
    const template = new Uint8Array(await readFile(templateUrl));
    const result = mergeContactDocument(template, contact, {
      taxYear: 2026,
      at: new Date("2026-12-31T12:00:00.000Z"),
      gifts: [
        { date: "2026-02-10", amount: 100, designation: "General", paymentMethod: "Check" },
        { date: "2026-08-24", amount: 1500, designation: "Mission trip", paymentMethod: "Venmo" },
      ],
    });
    expect(result.replacementCount).toBeGreaterThan(10);
    const documentXml = new TextDecoder().decode(unzipOfficeArchive(result.bytes).get("word/document.xml"));
    expect(documentXml).toContain("Jordan Example");
    expect(documentXml).toContain("123 Hope Lane");
    expect(documentXml).toContain("$1,600.00");
    expect(documentXml).toContain("$100.00");
    expect(documentXml).toContain("$1,500.00");
    expect(documentXml).not.toMatch(/\[\[[A-Z0-9_]+\]\]/);
  });

  it("packages one personalized Word file per selected contact", async () => {
    const templateUrl = new URL("../../../admin/supplemental-documents/Hope-Sojourns-Giving-Statement-Template.docx", import.meta.url);
    const template = new Uint8Array(await readFile(templateUrl));
    const batch = buildDocumentBatchZip(template, [{ contact, gifts: [] }], {
      kind: "giving_statement", taxYear: 2026, templateName: "Hope-Sojourns-Giving-Statement-Template.docx",
      at: new Date("2026-12-31T12:00:00.000Z"),
    });
    const entries = unzipOfficeArchive(batch);
    expect([...entries.keys()].some(name => name.endsWith(".docx"))).toBe(true);
    expect(new TextDecoder().decode(entries.get("README.txt"))).toContain("Statements with no recorded gifts");
  });
});
