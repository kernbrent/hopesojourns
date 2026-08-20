import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import {
  parseContactImportFile,
  validateContactImportRow,
  type ContactImportOpportunity,
} from "../src/contact-import";

const trips: ContactImportOpportunity[] = [
  { id: "trip-athens", slug: "trip-athens", title: "Athens", location: "Athens, Greece" },
  { id: "trip-kenya", slug: "trip-kenya", title: "Kenya", location: "Kenya" },
];

describe("contact spreadsheet import", () => {
  it("parses and validates a CSV saved from the template", () => {
    const csv = [
      "Contact ID,First Name*,Last Name*,Preferred Name,Email,Cell Phone,Preferred Contact,Contact Status,Contact Types,Hope Sojourns Areas,Organization,Website,Address Line 1,Address Line 2,City,State / Province / Region,Postal Code,Country,Languages Spoken,Trip Codes,School / Field / Specialty,Last Contacted,Notes",
      ",María,O'Neil,Mari,maria@example.org,+1 (214) 555-0199,Email,Active,Leader; Donor,Mission; Corporate,Example Ministry,https://example.org,123 Main St,,Dallas,Texas,75201,United States,English; Spanish,trip-athens; trip-kenya,Social Work,08/19/2026,Met at orientation",
    ].join("\r\n");
    const parsed = parseContactImportFile("contacts.csv", new TextEncoder().encode(csv));
    expect(parsed.headerRowNumber).toBe(1);
    expect(parsed.rows).toHaveLength(1);
    const validated = validateContactImportRow(parsed.rows[0], trips);
    expect(validated.errors).toEqual([]);
    expect(validated.input).toMatchObject({
      firstName: "María",
      lastName: "O'Neil",
      contactTypes: ["leader", "donor"],
      areas: ["mission", "corporate"],
      tripIds: ["trip-athens", "trip-kenya"],
      lastContactedAt: "2026-08-19T00:00:00.000Z",
    });
  });

  it("reports row-level corrections without discarding other rows", () => {
    const csv = [
      "First Name,Last Name,Email,Cell Phone,Trip Codes,Last Contacted",
      "Sam,Example,not-an-email,,missing-trip,02/30/2026",
    ].join("\n");
    const parsed = parseContactImportFile("contacts.csv", new TextEncoder().encode(csv));
    const validated = validateContactImportRow(parsed.rows[0], trips);
    expect(validated.input).toBeNull();
    expect(validated.errors.join(" ")).toContain("Email is not a valid email address");
    expect(validated.errors.join(" ")).toContain("Trip Code “missing-trip” was not found");
    expect(validated.errors.join(" ")).toContain("Last Contacted must be a real date");
  });

  it("opens the exact Excel template delivered to the administrator", async () => {
    const templateUrl = new URL(
      "../../../outputs/contact-import-template/hope-sojourns-contact-import-template.xlsx",
      import.meta.url,
    );
    const bytes = new Uint8Array(await readFile(templateUrl));
    const parsed = parseContactImportFile("hope-sojourns-contact-import-template.xlsx", bytes);
    expect(parsed.sheetName).toBe("Contacts");
    expect(parsed.headerRowNumber).toBe(5);
    expect(parsed.rows).toEqual([]);
  });

  it("rejects disguised or damaged Excel files", () => {
    expect(() => parseContactImportFile("contacts.xlsx", new TextEncoder().encode("not an xlsx file")))
      .toThrow("Choose a valid Excel .xlsx file");
  });

  it("rejects unfinished quoted CSV cells", () => {
    const csv = 'First Name,Last Name,Email,Cell Phone\n"Sam,Example,sam@example.org,';
    expect(() => parseContactImportFile("contacts.csv", new TextEncoder().encode(csv)))
      .toThrow("unfinished quoted cell");
  });
});
