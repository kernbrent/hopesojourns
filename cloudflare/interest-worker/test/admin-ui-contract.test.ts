import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const testDirectory = dirname(fileURLToPath(import.meta.url));
const adminScript = readFileSync(resolve(testDirectory, "../../../admin/admin.js"), "utf8");
const adminPage = readFileSync(resolve(testDirectory, "../../../admin/index.html"), "utf8");

describe("Admin Portal sign-in contract", () => {
  it("requires a manual form submission before opening the dashboard", () => {
    const startup = adminScript.match(/\(async function startPortal\(\) \{([\s\S]*?)\}\)\(\);/)?.[1] || "";
    expect(startup).not.toContain('api("/session")');
    expect(startup).not.toContain("showDashboard(");
    expect(adminScript).toContain('loginForm.addEventListener("submit"');
    expect(adminScript).toContain("showDashboard(result)");
  });

  it("keeps browser-managed saved-password autofill enabled", () => {
    expect(adminPage).toContain('autocomplete="username"');
    expect(adminPage).toContain('autocomplete="current-password"');
    expect(adminScript).not.toContain("localStorage.setItem(ADMIN_REMEMBER_ME_PREFERENCE_KEY, passwordInput.value)");
  });
});