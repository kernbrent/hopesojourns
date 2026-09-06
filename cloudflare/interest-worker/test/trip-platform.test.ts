import { describe, expect, it } from "vitest";
import {
  calculateTripAccountBalance,
  normalizeTripCatalogName,
  validateTripInput,
} from "../src/trip-platform";

const validTrip = {
  opportunityId: "11111111-1111-4111-8111-111111111111",
  code: "mex-2027",
  slug: "mexico-city-january-2027",
  title: "Mexico City — January 2027",
  subtitle: "Serving alongside Metro Relief",
  location: "Mexico City, Mexico",
  startDate: "2027-01-10",
  endDate: "2027-01-16",
  status: "recruiting",
  capacity: 15,
  publicSummary: "A joint journey of practical care.",
  publicDescription: "Serve with trusted ministry partners.",
  publicCallToAction: "I'm interested",
  publicEnabled: true,
  interestEnabled: true,
  portalEnabled: false,
};

describe("trip platform validation", () => {
  it("normalizes codes, flags, and optional values", () => {
    const trip = validateTripInput(validTrip);
    expect(trip.code).toBe("MEX-2027");
    expect(trip.slug).toBe("mexico-city-january-2027");
    expect(trip.publicEnabled).toBe(1);
    expect(trip.interestEnabled).toBe(1);
    expect(trip.portalEnabled).toBe(0);
  });

  it("rejects an end date before the start date", () => {
    expect(() => validateTripInput({ ...validTrip, endDate: "2027-01-09" }))
      .toThrow("end date cannot be before");
  });

  it("rejects unsafe public slugs", () => {
    expect(() => validateTripInput({ ...validTrip, slug: "Mexico City!" }))
      .toThrow("lowercase letters");
  });
});

describe("trip finance helpers", () => {
  it("keeps catalog matching case-insensitive and whitespace-normalized", () => {
    expect(normalizeTripCatalogName("  Metro   Relief  ")).toBe("metro relief");
  });

  it("calculates an account balance after payments and approved coverage", () => {
    expect(calculateTripAccountBalance({ charges: 2_000, payments: 500, awards: 1_500 })).toBe(0);
    expect(calculateTripAccountBalance({ charges: 1_250.45, payments: 400.1, awards: 200 })).toBe(650.35);
  });
});
