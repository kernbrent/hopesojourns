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
const journeyPage = readFileSync(resolve(testDirectory, "../../../journey/index.html"), "utf8");
const journeyScript = readFileSync(resolve(testDirectory, "../../../journey/journey.js"), "utf8");
const journeyCss = readFileSync(resolve(testDirectory, "../../../journey/journey.css"), "utf8");

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
    expect(tripScript).toContain("openGuideStep(step)");
    expect(tripScript).toContain("Please complete");
    expect(tripPage).toContain('id="trip-guide-alert"');
  });

  it("lets administrators reveal every password without weakening saved-password support", () => {
    expect((adminPage.match(/type="password"/g) || []).length).toBe((adminPage.match(/data-password-toggle/g) || []).length);
    expect((tripPage.match(/type="password"/g) || []).length).toBe((tripPage.match(/data-password-toggle/g) || []).length);
    expect((journeyPage.match(/type="password"/g) || []).length).toBe(1);
    expect(journeyPage).toContain('id="journey-password-toggle"');
    expect(journeyScript).toContain('input.type = revealing ? "text" : "password"');
  });

  it("keeps traveler sign-in responsive through the session handoff", () => {
    expect(journeyPage).toContain('data-journey-build="2026-09-06.5"');
    expect(journeyPage).toContain("Your personal email address is not used on this screen.");
    expect(journeyCss).toContain(".journey-page [hidden] { display: none !important; }");
    expect(journeyScript).toContain("const REQUEST_TIMEOUT_MS = 15_000");
    expect(journeyScript).toContain("const SESSION_RETRY_DELAYS = [300, 800]");
    expect(journeyScript).toContain("setLoginBusy(form, true)");
    expect(journeyScript).toContain("Still opening your trip.");
    expect(journeyScript).toContain('setStatus("");');
  });

  it("locks saved trip credentials until the administrator deliberately unlocks them", () => {
    expect(tripPage).toContain('id="trip-portal-unlock"');
    expect(tripPage).toContain("Credentials are protected.");
    expect(tripScript).toContain("setPortalCredentialLocked(Boolean(trip.portal_login_id))");
    expect(tripScript).toContain("Credentials unlocked. Enter a new password");
    expect(tripStyles).toContain(".trip-credential-card.is-locked");
  });

  it("provides persistent slide-out administration menus without a sign-in flash", () => {
    expect(adminPage).toContain('id="admin-sidebar-toggle"');
    expect(adminPage).toContain('id="admin-auth-loading"');
    expect(adminPage).toContain('id="login-panel" aria-labelledby="login-title" hidden');
    expect(adminScript).toContain("initializeAdminSidebar()");
    expect(tripPage).toContain('id="trip-sidebar-toggle"');
    expect(tripPage).toContain('id="trip-auth-loading"');
    expect(tripPage).toContain('id="trip-admin-login" aria-labelledby="trip-admin-login-title" hidden');
    expect(tripScript).toContain("initializeSidebar()");
    expect(tripScript).toContain("authLoading.hidden = true");
  });

  it("offers preview-first spreadsheet imports from the applicable trip workspaces", () => {
    expect(tripPage.match(/data-open-trip-import/g)).toHaveLength(4);
    expect(tripPage).toContain("Hope-Sojourns-Trip-Bulk-Import-Template.xlsx");
    expect(tripPage).toContain('id="trip-import-preview"');
    expect(tripPage).toContain('id="trip-import-commit"');
    expect(tripScript).toContain("sendTripImport(false)");
    expect(tripScript).toContain("sendTripImport(true)");
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
