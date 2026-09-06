import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const adminScript = readFileSync(resolve(process.cwd(), "../../admin/admin.js"), "utf8");
const adminPage = readFileSync(resolve(process.cwd(), "../../admin/index.html"), "utf8");
const tripScript = readFileSync(resolve(process.cwd(), "../../admin/trips/trips.js"), "utf8");
const tripPage = readFileSync(resolve(process.cwd(), "../../admin/trips/index.html"), "utf8");

describe("Admin dialog behavior", () => {
  it("keeps every dialog open when its backdrop is clicked", () => {
    expect(adminScript).toContain("preventDialogBackdropDismissal");
    expect(adminScript).toContain("event.stopImmediatePropagation()");
    expect(adminPage.match(/closedby="closerequest"/g)).toHaveLength(6);
    expect(adminScript).not.toContain("event.target === submissionDialog");
    expect(adminScript).not.toContain("event.target === changePasswordDialog");
  });

  it("applies the same no-backdrop-dismiss rule to the trip workspace", () => {
    expect(tripScript).toContain("preventDialogBackdropDismissal");
    expect(tripScript).toContain("event.stopImmediatePropagation()");
    expect(tripPage).toContain('closedby="closerequest"');
    expect(tripScript).not.toContain("event.target === tripDialog");
  });
});
