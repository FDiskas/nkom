import { describe, expect, test } from "bun:test";
import { getEventTypeIcon } from "./waste.ts";

describe("getEventTypeIcon", () => {
  test("maps mixed waste to the bin icon", () => {
    expect(getEventTypeIcon("Mišrios atliekos")).toBe("🗑️");
  });

  test("maps packaging to the recycle icon", () => {
    expect(getEventTypeIcon("Pakuotės")).toBe("♻️");
  });

  test("maps glass to the bottle icon", () => {
    expect(getEventTypeIcon("Stiklas")).toBe("🍾");
  });

  test("falls back to the calendar icon for unknown types", () => {
    expect(getEventTypeIcon("Žaliosios atliekos")).toBe("📅");
  });
});
