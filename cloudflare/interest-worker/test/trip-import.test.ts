import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { parseTripImportSheets } from "../src/trip-import";
import { readSpreadsheet } from "../src/spreadsheet-reader";
import { buildTripWorkbook } from "../src/trip-xlsx";

const testDirectory = dirname(fileURLToPath(import.meta.url));
const workbookPath = resolve(testDirectory, "../../../outputs/01a0775c-925e-7713-9822-42450cb2f4b6/Hope-Sojourns-Trip-Bulk-Import-Template.xlsx");

describe("trip spreadsheet import", () => {
  it("reads the distributed template and preserves every supported sheet contract", () => {
    const bytes = readFileSync(workbookPath);
    const sheets = readSpreadsheet("Hope-Sojourns-Trip-Bulk-Import-Template.xlsx", new Uint8Array(bytes));
    expect(sheets.map(sheet => sheet.name)).toEqual([
      "Instructions", "People", "Ministries", "Team", "Partners", "Content", "Accounts", "Budget", "Allocations", "Charges", "Support", "Payments", "Invites",
    ]);
    expect(parseTripImportSheets(sheets)).toEqual([]);
    expect(sheets.find(sheet => sheet.name === "Budget")?.rows.find(row => row.rowNumber === 4)?.cells).toContain("Settlement Route");
    expect(sheets.find(sheet => sheet.name === "Budget")?.rows.find(row => row.rowNumber === 4)?.cells).toContain("Calculation Method");
    expect(sheets.find(sheet => sheet.name === "Budget")?.rows.find(row => row.rowNumber === 4)?.cells).toContain("Percentage Rate");
    expect(sheets.find(sheet => sheet.name === "Payments")?.rows.find(row => row.rowNumber === 4)?.cells).toContain("Charitable Amount");
  });

  it("parses a generated round-trip workbook with people and ministries before dependent rows", () => {
    const bytes = buildTripWorkbook([
      {
        name: "Team",
        purpose: "Team",
        headers: ["Import Ref", "Person Email", "Role", "Status"],
        rows: [["member-jane", "jane@example.org", "traveler", "confirmed"]],
      },
      {
        name: "Ministries",
        purpose: "Ministries",
        headers: ["Import Ref", "Organization Name", "Status"],
        rows: [["ministry-one-creation", "One Creation", "active"]],
      },
      {
        name: "People",
        purpose: "People",
        headers: ["Import Ref", "First Name", "Last Name", "Email", "Contact Status"],
        rows: [["person-jane", "Jane", "Doe", "jane@example.org", "active"]],
      },
    ]);
    const sheets = readSpreadsheet("round-trip.xlsx", bytes);
    expect(parseTripImportSheets(sheets).map(row => row.entity)).toEqual(["person", "ministry", "member"]);
  });

  it("preserves exported update metadata without turning spreadsheet text into formulas", () => {
    const recordId = "11111111-1111-4111-8111-111111111111";
    const updatedAt = "2026-09-07T12:34:56.000Z";
    const fingerprint = "safe-fingerprint";
    const bytes = buildTripWorkbook([{
      name: "People",
      purpose: "Current people",
      headers: ["Import Ref", "First Name", "Last Name", "Email", "Contact Status", "Notes", "Record ID", "Original Updated At", "Original Fingerprint"],
      rows: [["person-jane", "Jane", "Doe", "jane@example.org", "active", "=SUM(1,1)\u0001", recordId, updatedAt, fingerprint]],
    }]);
    const sheets = readSpreadsheet("round-trip-metadata.xlsx", bytes);
    const rows = parseTripImportSheets(sheets);
    expect(rows[0]?.values["notes"]).toBe("=SUM(1,1)");
    expect(rows[0]?.values["record id"]).toBe(recordId);
    expect(rows[0]?.values["original updated at"]).toBe(updatedAt);
    expect(rows[0]?.values["original fingerprint"]).toBe(fingerprint);
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
