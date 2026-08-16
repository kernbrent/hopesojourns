import { describe, expect, it } from "vitest";
import { isAllowedOrigin, parseAmount, routePath } from "../src/index";

describe("parseAmount", () => {
  it("normalizes whole-dollar and two-decimal donations", () => {
    expect(parseAmount("25")).toBe("25.00");
    expect(parseAmount("25.5")).toBe("25.50");
    expect(parseAmount(25.55)).toBe("25.55");
  });

  it("rejects malformed, too-small, and excessive donations", () => {
    for (const value of ["0", "1.001", "-2", "abc", 100_001, null]) {
      expect(() => parseAmount(value)).toThrow();
    }
  });
});

describe("routing and origins", () => {
  it("supports both workers.dev and the future site route", () => {
    expect(routePath("/health")).toBe("/health");
    expect(routePath("/api/paypal/health")).toBe("/health");
    expect(routePath("/api/paypal")).toBe("/");
  });

  it("allows exact production origins and explicitly configured local preview ports", () => {
    const allowed = "https://hopesojourns.com,https://www.hopesojourns.com,http://localhost:*,http://127.0.0.1:*";
    expect(isAllowedOrigin("https://hopesojourns.com", allowed)).toBe(true);
    expect(isAllowedOrigin("http://localhost:3000", allowed)).toBe(true);
    expect(isAllowedOrigin("http://127.0.0.1:4173", allowed)).toBe(true);
    expect(isAllowedOrigin("https://localhost:3000", allowed)).toBe(false);
    expect(isAllowedOrigin("http://localhost.evil.example:3000", allowed)).toBe(false);
    expect(isAllowedOrigin("https://evil.example", allowed)).toBe(false);
    expect(isAllowedOrigin(null, allowed)).toBe(false);
  });
});
