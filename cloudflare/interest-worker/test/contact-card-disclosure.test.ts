import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const testDirectory = dirname(fileURLToPath(import.meta.url));
const adminScript = readFileSync(resolve(testDirectory, "../../../admin/admin.js"), "utf8");
const adminStyles = readFileSync(resolve(testDirectory, "../../../admin/admin.css"), "utf8");

describe("Admin contact progressive disclosure contract", () => {
  it("renders only the requested directory fields in the compact state", () => {
    expect(adminScript).toContain('for (const label of ["Name", "Contact type", "Organization", "Phone number"])');
    expect(adminScript).toContain('personCompactField("Contact type"');
    expect(adminScript).toContain('personCompactField("Organization"');
    expect(adminScript).toContain('personCompactField("Phone number"');
    expect(adminScript).toContain('field.dataset.personCompact = ""');
  });

  it("uses separate accessible controls for the full record and summary expansion", () => {
    expect(adminScript).toContain('element("button", "admin-person-name-button")');
    expect(adminScript).toContain('nameButton.addEventListener("click", () => openPerson(person.id))');
    expect(adminScript).toContain('element("button", "admin-person-expand-button", "+")');
    expect(adminScript).toContain('expandButton.addEventListener("click", () => togglePersonCard(card))');
    expect(adminScript).toContain('expandButton.setAttribute("aria-expanded", String(expanded))');
    expect(adminScript).toContain('peopleList.querySelectorAll(".admin-person-card.is-expanded")');
  });

  it("reveals the existing summary and complete-record action only after expansion", () => {
    expect(adminScript).toContain('contact.dataset.personExpanded = ""');
    expect(adminScript).toContain('interests.dataset.personExpanded = ""');
    expect(adminScript).toContain('activity.dataset.personExpanded = ""');
    expect(adminScript).toContain('"admin-button admin-button-outline admin-person-view-all", "View everything"');
    expect(adminScript).toContain('viewEverything.addEventListener("click", () => openPerson(person.id))');
  });

  it("keeps compact rows dense on desktop and labeled on phones", () => {
    expect(adminStyles).toContain(".admin-person-list-heading");
    expect(adminStyles).toContain(".admin-person-card.is-expanded");
    expect(adminStyles).toContain(".admin-person-compact-label");
    expect(adminStyles).toMatch(/@media \(max-width: 760px\)[\s\S]*\.admin-person-card\.is-expanded/);
  });
});
