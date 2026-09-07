import fs from "node:fs/promises";
import path from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { SpreadsheetFile, Workbook } = require("@oai/artifact-tool");

const outputDir = path.resolve("outputs/01a0775c-925e-7713-9822-42450cb2f4b6");
const previewDir = path.join(outputDir, "trip-import-previews");
const outputPath = path.join(outputDir, "Hope-Sojourns-Trip-Bulk-Import-Template.xlsx");
await fs.mkdir(previewDir, { recursive: true });

const colors = {
  forest: "#173F35",
  forestSoft: "#2C6658",
  gold: "#E2A23A",
  cream: "#FBF7EE",
  pale: "#EAF2EF",
  white: "#FFFFFF",
  ink: "#15362F",
  muted: "#5D6F69",
  border: "#C8D5D0",
  input: "#FFF7DD",
};
const font = "Aptos";
const workbook = Workbook.create();

function columnName(index) {
  let value = index + 1;
  let result = "";
  while (value) {
    value -= 1;
    result = String.fromCharCode(65 + (value % 26)) + result;
    value = Math.floor(value / 26);
  }
  return result;
}

function addDataSheet({ name, purpose, headers, widths = {}, validations = {}, formats = {} }) {
  const sheet = workbook.worksheets.add(name);
  const lastColumn = columnName(headers.length - 1);
  sheet.showGridLines = false;
  sheet.tabColor = name === "Team" || name === "Content" ? colors.gold : colors.forestSoft;
  sheet.mergeCells(`A1:${lastColumn}1`);
  sheet.getRange("A1").values = [[`Hope Sojourns — ${name}`]];
  sheet.mergeCells(`A2:${lastColumn}2`);
  sheet.getRange("A2").values = [[purpose]];
  sheet.mergeCells(`A3:${lastColumn}3`);
  sheet.getRange("A3").values = [["Enter one item per row. Import Ref must be unique on this sheet and should never be reused for changed data."]];
  sheet.getRange(`A4:${lastColumn}4`).values = [headers];
  sheet.getRange(`A1:${lastColumn}104`).format.font = { name: font, size: 10, color: colors.ink };
  sheet.getRange(`A1:${lastColumn}1`).format = {
    fill: colors.forest,
    font: { name: font, size: 18, bold: true, color: colors.white },
    rowHeight: 34,
    verticalAlignment: "center",
  };
  sheet.getRange(`A2:${lastColumn}2`).format = {
    fill: colors.pale,
    font: { name: font, size: 10, italic: true, color: colors.ink },
    wrapText: true,
    rowHeight: 34,
    verticalAlignment: "center",
  };
  sheet.getRange(`A3:${lastColumn}3`).format = {
    fill: colors.cream,
    font: { name: font, size: 9, color: colors.muted },
    wrapText: true,
    rowHeight: 28,
    verticalAlignment: "center",
  };
  sheet.getRange(`A4:${lastColumn}4`).format = {
    fill: colors.forestSoft,
    font: { name: font, size: 10, bold: true, color: colors.white },
    wrapText: true,
    rowHeight: 32,
    verticalAlignment: "center",
    borders: { preset: "all", style: "thin", color: colors.border },
  };
  sheet.getRange(`A5:${lastColumn}104`).format = {
    fill: colors.input,
    borders: { preset: "all", style: "thin", color: colors.border },
    verticalAlignment: "top",
    wrapText: true,
    rowHeight: 24,
  };
  headers.forEach((header, index) => {
    const col = columnName(index);
    sheet.getRange(`${col}1:${col}104`).format.columnWidth = widths[header] || (header.includes("notes") || header === "content" || header === "reason" ? 28 : 18);
    if (formats[header]) sheet.getRange(`${col}5:${col}104`).format.numberFormat = formats[header];
    if (validations[header]) sheet.getRange(`${col}5:${col}104`).dataValidation = { rule: { type: "list", values: validations[header] } };
  });
  sheet.freezePanes.freezeRows(4);
  const table = sheet.tables.add(`A4:${lastColumn}104`, true, `Hs${name.replace(/[^A-Za-z0-9]/g, "")}Import`);
  table.style = "TableStyleMedium4";
  table.showFilterButton = true;
  return sheet;
}

const instructions = workbook.worksheets.add("Instructions");
instructions.showGridLines = false;
instructions.tabColor = colors.gold;
instructions.mergeCells("A1:F1");
instructions.getRange("A1").values = [["Hope Sojourns Trip Bulk Import"]];
instructions.getRange("A1:F1").format = { fill: colors.forest, font: { name: font, size: 20, bold: true, color: colors.white }, rowHeight: 40, verticalAlignment: "center" };
instructions.mergeCells("A2:F2");
instructions.getRange("A2").values = [["Prepare one trip workbook, preview it in the Trip workspace, correct any flagged rows, and then import. Blank sheets are ignored."]];
instructions.getRange("A2:F2").format = { fill: colors.pale, font: { name: font, size: 11, italic: true, color: colors.ink }, rowHeight: 38, wrapText: true, verticalAlignment: "center" };
instructions.getRange("A4:B4").values = [["Step", "What to do"]];
instructions.getRange("A5:B10").values = [
  ["1", "Create the trip in the Hope Sojourns Admin Portal."],
  ["2", "Create any missing people, ministries, cost categories, and funding sources before importing."],
  ["3", "Complete only the sheets you need. Keep the exact sheet names and row 4 headers."],
  ["4", "Use a unique Import Ref for every populated row. Use cross-sheet refs for Accounts, Budget items, and Charges."],
  ["5", "Upload the workbook and choose Preview import. Nothing is saved during preview."],
  ["6", "When all rows are ready, choose Import ready rows. Re-uploading an unchanged row safely skips it."],
];
instructions.getRange("D4:F4").values = [["Important rule", "Details", "Example"]];
instructions.getRange("D5:F10").values = [
  ["Import Ref", "3–80 letters, numbers, periods, underscores, or hyphens.", "acct-jane-doe"],
  ["References", "Account Ref, Budget Item Ref, and Charge Ref must match an Import Ref on the named source sheet.", "cost-airfare-01"],
  ["Existing records", "Person Email, Organization Name, Category Name, and Funding Source Name must already exist in the Admin Portal.", "traveler@example.org"],
  ["Dates", "Enter real Excel dates or YYYY-MM-DD.", "2027-07-10"],
  ["Yes / No", "Use Yes or No in visibility columns.", "Yes"],
  ["Security", "Never put passwords, card data, bank data, or invitation links into this workbook.", "No passwords"],
];
instructions.getRange("A4:B10").format.borders = { preset: "all", style: "thin", color: colors.border };
instructions.getRange("D4:F10").format.borders = { preset: "all", style: "thin", color: colors.border };
instructions.getRange("A4:B4").format = { fill: colors.forestSoft, font: { name: font, bold: true, color: colors.white }, wrapText: true };
instructions.getRange("D4:F4").format = { fill: colors.forestSoft, font: { name: font, bold: true, color: colors.white }, wrapText: true };
instructions.getRange("A5:F10").format = { font: { name: font, size: 10, color: colors.ink }, wrapText: true, verticalAlignment: "top" };
instructions.getRange("A:A").format.columnWidth = 10;
instructions.getRange("B:B").format.columnWidth = 45;
instructions.getRange("C:C").format.columnWidth = 4;
instructions.getRange("D:D").format.columnWidth = 20;
instructions.getRange("E:E").format.columnWidth = 42;
instructions.getRange("F:F").format.columnWidth = 24;
instructions.getRange("A5:F10").format.rowHeight = 38;
instructions.freezePanes.freezeRows(2);

addDataSheet({
  name: "Team",
  purpose: "Connect existing people to this trip. Person Email must match an active contact in the People workspace.",
  headers: ["Import Ref", "Person Email", "Organization Name", "Role", "Status", "Directory Visible", "Show Email", "Show Phone", "Notes"],
  widths: { "Import Ref": 20, "Person Email": 28, "Organization Name": 25 },
  validations: { Role: ["traveler", "leader", "staff", "host", "other"], Status: ["interested", "invited", "applied", "approved", "confirmed", "waitlisted", "withdrawn"], "Directory Visible": ["Yes", "No"], "Show Email": ["Yes", "No"], "Show Phone": ["Yes", "No"] },
});
addDataSheet({
  name: "Partners",
  purpose: "Connect existing ministries, churches, payers, or logistics partners to the trip.",
  headers: ["Import Ref", "Organization Name", "Role", "Notes"],
  widths: { "Import Ref": 20, "Organization Name": 28, Role: 28, Notes: 36 },
});
addDataSheet({
  name: "Content",
  purpose: "Load itinerary entries, devotionals, instructions, resources, updates, and overview content.",
  headers: ["Import Ref", "Content Type", "Title", "Content", "Event Date", "Event Time", "Location", "Link URL", "Visibility", "Publication Status", "Sort Order"],
  widths: { "Import Ref": 20, Title: 28, Content: 48, Location: 24, "Link URL": 34 },
  validations: { "Content Type": ["overview", "devotional", "instruction", "itinerary", "resource", "update"], Visibility: ["public", "travelers", "admin"], "Publication Status": ["draft", "published"] },
  formats: { "Event Date": "yyyy-mm-dd", "Sort Order": "0" },
});
addDataSheet({
  name: "Accounts",
  purpose: "Create individual, family, group, organization, or sponsor accounts. Individual accounts require Person Email; organization accounts require Organization Name.",
  headers: ["Import Ref", "Account Type", "Account Name", "Person Email", "Organization Name", "Billing Email", "Billing Phone", "Financial Access", "Status", "Notes"],
  widths: { "Import Ref": 20, "Account Name": 28, "Person Email": 28, "Organization Name": 26, "Billing Email": 28 },
  validations: { "Account Type": ["individual", "family", "group", "organization", "sponsor"], "Financial Access": ["private_link", "email_only", "disabled"], Status: ["active", "closed", "canceled"] },
});
addDataSheet({
  name: "Budget",
  purpose: "Enter everything being paid for and who it relates to. Category Name must already exist. Account Ref is optional.",
  headers: ["Import Ref", "Category Name", "Description", "Expense Scope", "Account Ref", "Quantity", "Estimated Unit Cost", "Estimated Total", "Actual Total", "Vendor Name", "Vendor Organization Name", "Settlement Route", "Payment Status", "Payment Method", "External Reference", "Due Date", "Paid Date", "Notes"],
  widths: { "Import Ref": 20, "Category Name": 22, Description: 32, "Account Ref": 20, "Vendor Name": 24, "Vendor Organization Name": 26, Notes: 32 },
  validations: { "Expense Scope": ["trip", "group", "individual"], "Settlement Route": ["through_hs", "external"], "Payment Status": ["planned", "committed", "partially_paid", "paid", "canceled"] },
  formats: { Quantity: "0.00", "Estimated Unit Cost": "$#,##0.00", "Estimated Total": "$#,##0.00", "Actual Total": "$#,##0.00", "Due Date": "yyyy-mm-dd", "Paid Date": "yyyy-mm-dd" },
});
addDataSheet({
  name: "Allocations",
  purpose: "Show which existing funding source covers each Budget row.",
  headers: ["Import Ref", "Budget Item Ref", "Funding Source Name", "Amount", "Status", "Notes"],
  widths: { "Import Ref": 20, "Budget Item Ref": 22, "Funding Source Name": 28, Notes: 34 },
  validations: { Status: ["planned", "confirmed", "paid", "canceled"] },
  formats: { Amount: "$#,##0.00" },
});
addDataSheet({
  name: "Charges",
  purpose: "Create amounts owed by traveler, group, or organization accounts.",
  headers: ["Import Ref", "Account Ref", "Budget Item Ref", "Title", "Purpose", "Amount", "Due Date", "Status", "Notes"],
  widths: { "Import Ref": 20, "Account Ref": 22, "Budget Item Ref": 22, Title: 30, Notes: 34 },
  validations: { Purpose: ["trip_payment", "admin_fee", "other"], Status: ["open", "partially_paid", "paid", "waived", "canceled"] },
  formats: { Amount: "$#,##0.00", "Due Date": "yyyy-mm-dd" },
});
addDataSheet({
  name: "Support",
  purpose: "Record Hope Sojourns leader coverage, scholarships, sponsor credits, fee waivers, and other support.",
  headers: ["Import Ref", "Account Ref", "Funding Source Name", "Award Type", "Amount", "Award Date", "Status", "Reason"],
  widths: { "Import Ref": 20, "Account Ref": 22, "Funding Source Name": 28, Reason: 38 },
  validations: { "Award Type": ["leader_support", "scholarship", "sponsor_credit", "fee_waiver", "other"], Status: ["pending", "approved", "reversed"] },
  formats: { Amount: "$#,##0.00", "Award Date": "yyyy-mm-dd" },
});
addDataSheet({
  name: "Payments",
  purpose: "Record money received by Hope Sojourns or settled externally. Account, funding source, and charge references are optional.",
  headers: ["Import Ref", "Account Ref", "Funding Source Name", "Transaction Date", "Amount", "Purpose", "Payment Method", "Settlement Route", "Status", "Payer Name", "External Reference", "Source System", "Source Transaction ID", "Charitable Amount", "Charge Ref", "Applied Amount", "Notes"],
  widths: { "Import Ref": 20, "Account Ref": 22, "Funding Source Name": 26, "Payment Method": 20, "Payer Name": 24, "External Reference": 24, "Source Transaction ID": 24, Notes: 32 },
  validations: { Purpose: ["donation", "trip_payment", "admin_fee", "scholarship_contribution", "refund", "other"], "Settlement Route": ["through_hs", "external"], Status: ["pending", "received", "refunded", "voided"], "Source System": ["manual", "csm", "paypal", "venmo", "import", "other"] },
  formats: { "Transaction Date": "yyyy-mm-dd", Amount: "$#,##0.00", "Charitable Amount": "$#,##0.00", "Applied Amount": "$#,##0.00" },
});
addDataSheet({
  name: "Invites",
  purpose: "Create friendly private interest links. New invitation URLs are displayed once after import.",
  headers: ["Import Ref", "Organization Name", "Label", "Expires Date", "Max Uses"],
  widths: { "Import Ref": 20, "Organization Name": 28, Label: 32 },
  formats: { "Expires Date": "yyyy-mm-dd", "Max Uses": "0" },
});

for (const name of ["Instructions", "Team", "Partners", "Content", "Accounts", "Budget", "Allocations", "Charges", "Support", "Payments", "Invites"]) {
  const preview = await workbook.render({ sheetName: name, autoCrop: "all", scale: 1, format: "png" });
  await fs.writeFile(path.join(previewDir, `${name.toLowerCase()}.png`), new Uint8Array(await preview.arrayBuffer()));
}
const output = await SpreadsheetFile.exportXlsx(workbook);
await output.save(outputPath);
console.log(JSON.stringify({ outputPath, previewDir, sheets: 11 }));
