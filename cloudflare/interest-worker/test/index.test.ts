import { describe, expect, it } from "vitest";
import {
  isAllowedOrigin,
  normalizeEmail,
  normalizePhone,
  routePath,
  validateSubmissionPayload,
} from "../src/index";
import {
  adminPasswordPolicyError,
  csvCell,
  dateFilterBound,
  deriveAdminPasswordHash,
  secureEqual,
} from "../src/admin";

const validPayload = {
  firstName: "  María ",
  lastName: " O'Neil ",
  email: " MARIA@example.org ",
  phone: "+1 (214) 555-0199",
  contactPreference: "email",
  fieldOfStudy: "Social Work",
  preferredTiming: "Summer 2027",
  message: "I am interested in learning more.",
  opportunities: ["trip-athens", "internship-athens-greece", "trip-athens"],
  consent: true,
  idempotencyKey: "2a407f84-2635-4bc2-a04e-763f371cb2df",
};

describe("submission validation", () => {
  it("normalizes a person and keeps multiple distinct opportunities", () => {
    const result = validateSubmissionPayload(validPayload);
    expect(result.firstName).toBe("María");
    expect(result.emailNormalized).toBe("maria@example.org");
    expect(result.phoneNormalized).toBe("12145550199");
    expect(result.opportunities).toEqual(["internship-athens-greece", "trip-athens"]);
  });

  it("requires a valid email, consent, and at least one opportunity", () => {
    expect(() => validateSubmissionPayload({
      ...validPayload,
      email: "not-an-email",
      consent: false,
      opportunities: [],
    })).toThrow("Please review the highlighted fields.");
  });

  it("requires a cell phone number for every submission", () => {
    expect(() => validateSubmissionPayload({ ...validPayload, contactPreference: "email", phone: "" }))
      .toThrow("Please review the highlighted fields.");
  });
});

describe("normalization and routing", () => {
  it("normalizes email and phone values", () => {
    expect(normalizeEmail(" Person@Example.COM ")).toBe("person@example.com");
    expect(normalizePhone("(870) 555-0101")).toBe("8705550101");
    expect(normalizePhone("123")).toBeNull();
  });

  it("supports both workers.dev and a future site route", () => {
    expect(routePath("/submissions")).toBe("/submissions");
    expect(routePath("/api/interest/submissions")).toBe("/submissions");
    expect(routePath("/api/interest")).toBe("/");
  });

  it("allows exact production origins and configured local preview ports", () => {
    const allowed = "https://hopesojourns.com,http://localhost:*,http://127.0.0.1:*";
    expect(isAllowedOrigin("https://hopesojourns.com", allowed)).toBe(true);
    expect(isAllowedOrigin("http://localhost:3000", allowed)).toBe(true);
    expect(isAllowedOrigin("http://127.0.0.1:4173", allowed)).toBe(true);
    expect(isAllowedOrigin("https://localhost:3000", allowed)).toBe(false);
    expect(isAllowedOrigin("http://localhost.evil.example:3000", allowed)).toBe(false);
    expect(isAllowedOrigin("https://evil.example", allowed)).toBe(false);
  });
});

describe("admin security helpers", () => {
  it("compares passwords without exposing their original length", async () => {
    await expect(secureEqual("Missions", "Missions")).resolves.toBe(true);
    await expect(secureEqual("Missions", "missions")).resolves.toBe(false);
    await expect(secureEqual("short", "a much longer value")).resolves.toBe(false);
  });

  it("enforces a strong but practical administrator password policy", () => {
    expect(adminPasswordPolicyError("short1!A")).toContain("12 characters");
    expect(adminPasswordPolicyError("alllowercase1234")).toContain("three of these");
    expect(adminPasswordPolicyError("HopeSojourns2026!")).toBeNull();
  });

  it("derives stable salted password hashes", async () => {
    const firstSalt = Uint8Array.from({ length: 16 }, (_, index) => index);
    const secondSalt = Uint8Array.from({ length: 16 }, (_, index) => index + 1);
    const first = await deriveAdminPasswordHash("HopeSojourns2026!", firstSalt, 10);
    const same = await deriveAdminPasswordHash("HopeSojourns2026!", firstSalt, 10);
    const differentSalt = await deriveAdminPasswordHash("HopeSojourns2026!", secondSalt, 10);
    expect(first).toBe(same);
    expect(first).not.toBe(differentSalt);
  });

  it("stays within the Cloudflare Workers PBKDF2 limit", async () => {
    const salt = Uint8Array.from({ length: 16 }, (_, index) => index);
    await expect(deriveAdminPasswordHash("HopeSojourns2026!", salt)).resolves.toMatch(/^[A-Za-z0-9_-]{40,60}$/);
    await expect(deriveAdminPasswordHash("HopeSojourns2026!", salt, 100_001))
      .rejects.toThrow("between 1 and 100000");
  });

  it("neutralizes spreadsheet formulas in CSV exports", () => {
    expect(csvCell("=HYPERLINK(\"https://example.org\")")).toBe("\"'=HYPERLINK(\"\"https://example.org\"\")\"");
    expect(csvCell("ordinary text")).toBe("\"ordinary text\"");
  });

  it("turns inclusive calendar filters into safe UTC query bounds", () => {
    expect(dateFilterBound("2026-08-19")).toBe("2026-08-19T00:00:00.000Z");
    expect(dateFilterBound("2026-08-19", true)).toBe("2026-08-20T00:00:00.000Z");
    expect(dateFilterBound(null)).toBeNull();
    expect(() => dateFilterBound("2026-02-30")).toThrow("Choose a valid date filter.");
  });
});
