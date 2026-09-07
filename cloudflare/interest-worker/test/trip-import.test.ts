import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { parseTripImportSheets } from "../src/trip-import";
import { readSpreadsheet } from "../src/spreadsheet-reader";

const testDirectory = dirname(fileURLToPath(import.meta.url));
const workbookPath = resolve(testDirectory, "../../../outputs/01a0775c-925e-7713-9822-42450cb2f4b6/Hope-Sojourns-Trip-Bulk-Import-Template.xlsx");

describe("trip spreadsheet import", () => {
  it("reads the distributed template and preserves every supported sheet contract", () => {
    const bytes = readFileSync(workbookPath);
    const sheets = readSpreadsheet("Hope-Sojourns-Trip-Bulk-Import-Template.xlsx", new Uint8Array(bytes));
    expect(sheets.map(sheet => sheet.name)).toEqual([
      "Instructions", "Team", "Partners", "Content", "Accounts", "Budget", "Allocations", "Charges", "Support", "Payments", "Invites",
    ]);
    expect(parseTripImportSheets(sheets)).toEqual([]);
    expect(sheets.find(sheet => sheet.name === "Budget")?.rows.find(row => row.rowNumber === 4)?.cells).toContain("Settlement Route");
    expect(sheets.find(sheet => sheet.name === "Payments")?.rows.find(row => row.rowNumber === 4)?.cells).toContain("Charitable Amount");
  });

  it("orders valid rows by dependency and rejects duplicate Import Refs", () => {
    const accountHeaders = ["Import Ref", "Account Type", "Account Name", "Financial Access", "Status"];
    const costHeaders = ["Import Ref", "Category Name", "Description", "Expense Scope", "Settlement Route", "Payment Status"];
    const parsed = parseTripImportSheets([
      { name: "Budget", rows: [{ rowNumber: 4, cells: costHeaders }, { rowNumber: 5, cells: ["cost-1", "Airfare", "Flight", "trip", "through_hs", "planned"] }] },
      { name: "Accounts", rows: [{ rowNumber: 4, cells: accountHeaders }, { rowNumber: 5, cells: ["acct-1", "group", "Team", "private_link", "active"] }] },
    ]);
    expect(parsed.map(row => row.entity)).toEqual(["account", "cost"]);
    expect(() => parseTripImportSheets([
      { name: "Accounts", rows: [
        { rowNumber: 4, cells: accountHeaders },
        { rowNumber: 5, cells: ["acct-1", "group", "Team", "private_link", "active"] },
        { rowNumber: 6, cells: ["acct-1", "group", "Team 2", "private_link", "active"] },
      ] },
    ])).toThrow(/more than once/);
  });
});
