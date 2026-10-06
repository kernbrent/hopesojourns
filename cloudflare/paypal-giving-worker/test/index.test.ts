import { afterEach, describe, expect, it, vi } from "vitest";
import worker, { isAllowedOrigin, parseAmount, routePath } from "../src/index";

afterEach(() => vi.unstubAllGlobals());

describe("one-time gift capture", () => {
  it("sends the required JSON header on an empty capture POST and returns completion", async () => {
    const upstream = vi.fn(async (url: string, init: RequestInit) => {
      if (url.endsWith('/v1/oauth2/token')) return Response.json({ access_token: 'test-token' });
      expect(url).toBe('https://api-m.sandbox.paypal.com/v2/checkout/orders/TEST-ORDER/capture');
      expect(init.method).toBe('POST');
      const headers = new Headers(init.headers);
      if (headers.get('content-type') !== 'application/json') {
        return Response.json({ message: 'The request payload is not supported' }, { status: 415 });
      }
      expect(headers.get('paypal-request-id')).toBeTruthy();
      return Response.json({ id: 'TEST-ORDER', status: 'COMPLETED', payer: { name: { given_name: 'Brent', surname: 'Kern' } }, purchase_units: [{ payments: { captures: [{ id: 'TEST-CAPTURE', status: 'COMPLETED', amount: { value: '123.45', currency_code: 'USD' } }] } }] });
    });
    vi.stubGlobal('fetch', upstream);
    const env = { PAYPAL_CLIENT_ID: 'test-client', PAYPAL_CLIENT_SECRET: 'test-secret', PAYPAL_API_BASE: 'https://api-m.sandbox.paypal.com', ALLOWED_ORIGINS: 'https://hopesojourns.com' } as unknown as Env;
    const request = new Request('https://giving.example/orders/TEST-ORDER/capture', { method: 'POST', headers: { origin: 'https://hopesojourns.com' } });
    const response = await worker.fetch(request as Parameters<typeof worker.fetch>[0], env);
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ status: 'COMPLETED', captureStatus: 'COMPLETED', captureId: 'TEST-CAPTURE', amount: '123.45', currency: 'USD', donorName: 'Brent Kern' });
    expect(upstream).toHaveBeenCalledTimes(2);
  });
});

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
