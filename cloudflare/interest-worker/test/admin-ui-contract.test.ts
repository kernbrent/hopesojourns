import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const testDirectory = dirname(fileURLToPath(import.meta.url));
const adminScript = readFileSync(resolve(testDirectory, "../../../admin/admin.js"), "utf8");
const adminPage = readFileSync(resolve(testDirectory, "../../../admin/index.html"), "utf8");
const publicStyles = readFileSync(resolve(testDirectory, "../../../styles.css"), "utf8");
const tripScript = readFileSync(resolve(testDirectory, "../../../admin/trips/trips.js"), "utf8");
const tripPage = readFileSync(resolve(testDirectory, "../../../admin/trips/index.html"), "utf8");
const tripStyles = readFileSync(resolve(testDirectory, "../../../admin/trips/trips.css"), "utf8");

describe("Admin Portal sign-in contract", () => {
  it("requires manual sign-in on direct visits but resumes intentional trip-workspace navigation", () => {
    const startup = adminScript.match(/\(async function startPortal\(\) \{([\s\S]*?)\}\)\(\);/)?.[1] || "";
    expect(startup).toContain("consumeAdminNavigationIntent()");
    expect(startup).toContain('api("/session")');
    expect(startup).toContain("showDashboard(result)");
    expect(adminScript).toContain("sessionStorage.removeItem(ADMIN_NAVIGATION_SESSION_KEY)");
    expect(adminScript).toContain('loginForm.addEventListener("submit"');
    expect(adminScript).toContain("showDashboard(result)");
  });

  it("opens the destination named by a trusted admin navigation hash", () => {
    expect(adminScript).toContain('"#ledger": "ledger"');
    expect(adminScript).toContain('"#ministries": "ministries"');
    expect(adminScript).toContain("switchView(requestedAdminView())");
  });

  it("explains and blocks trip actions whose prerequisite records do not exist", () => {
    expect(tripPage.match(/data-prerequisite=/g)).toHaveLength(8);
    expect(tripScript).toContain("renderPrerequisiteGuidance()");
    expect(tripScript).toContain("submit.disabled = prerequisite");
    expect(tripScript).toContain("Please complete this traveler or leader in People before this team member.");
    expect(tripScript).toContain("Please complete a trip cost before this funding allocation.");
    expect(tripScript).toContain("Please complete a trip account before this payment request.");
  });

  it("provides optional, persistent, progress-based trip setup guidance", () => {
    expect(tripPage).toContain('id="trip-guide-toggle"');
    expect(tripPage).toContain('id="trip-setup-guide"');
    expect(tripScript).toContain('const TRIP_GUIDED_HELP_KEY = "hope-sojourns-trip-guided-help"');
    expect(tripScript).toContain("localStorage.setItem(TRIP_GUIDED_HELP_KEY");
    expect(tripScript).toContain("steps complete");
    expect(tripScript).toContain("openNextGuideStep");
  });

  it("scopes public trip-card overlays away from admin form cards", () => {
    const adminClassTokens = [...tripPage.matchAll(/class="([^"]*)"/g)]
      .flatMap(match => match[1].split(/\s+/));
    expect(publicStyles).toContain(".trip-card::after");
    expect(adminClassTokens).not.toContain("trip-card");
    expect(adminClassTokens).toContain("trip-admin-card");
    expect(tripStyles).toContain(".trip-admin-card {");
  });

  it("keeps browser-managed saved-password autofill enabled", () => {
    expect(adminPage).toContain('autocomplete="username"');
    expect(adminPage).toContain('autocomplete="current-password"');
    expect(adminScript).not.toContain("localStorage.setItem(ADMIN_REMEMBER_ME_PREFERENCE_KEY, passwordInput.value)");
  });
});
