import { describe, expect, test } from "bun:test";
import {
  type CalendarEvent,
  buildIsoDate,
  createGoogleCalendarLink,
  dedupeEvents,
  extractCityCandidates,
  extractDatesFromRow,
  extractMonthColumns,
  extractScheduleYear,
  getMonthNumber,
  inferWasteType,
  parseDays,
} from "./nkomService.ts";

describe("parseDays", () => {
  test("accepts valid numeric day cells", () => {
    expect(parseDays(15)).toEqual([15]);
    expect(parseDays(31)).toEqual([31]);
  });

  test("rejects out-of-range and non-integer numbers", () => {
    expect(parseDays(0)).toEqual([]);
    expect(parseDays(32)).toEqual([]);
    expect(parseDays(1.5)).toEqual([]);
  });

  test("extracts, dedupes and sorts days from text", () => {
    expect(parseDays("12, 5, 12")).toEqual([5, 12]);
  });

  test("ignores numbers longer than two digits", () => {
    expect(parseDays("1 ir 100")).toEqual([1]);
  });

  test("returns empty for blank or non-string/number cells", () => {
    expect(parseDays("")).toEqual([]);
    expect(parseDays(null)).toEqual([]);
    expect(parseDays(undefined)).toEqual([]);
  });
});

describe("getMonthNumber", () => {
  test("maps Lithuanian month stems to month numbers", () => {
    expect(getMonthNumber("Sausis")).toBe(1);
    expect(getMonthNumber("Vasaris")).toBe(2);
    expect(getMonthNumber("Spalis")).toBe(10);
    expect(getMonthNumber("Gruodis")).toBe(12);
  });

  test("returns null for non-month text and non-strings", () => {
    expect(getMonthNumber("Savaitė")).toBeNull();
    expect(getMonthNumber(5)).toBeNull();
  });
});

describe("buildIsoDate", () => {
  test("formats valid calendar dates", () => {
    expect(buildIsoDate(2026, 2, 15)).toBe("2026-02-15");
    expect(buildIsoDate(2024, 2, 29)).toBe("2024-02-29");
  });

  test("rejects impossible dates", () => {
    expect(buildIsoDate(2026, 2, 29)).toBeNull();
    expect(buildIsoDate(2026, 13, 1)).toBeNull();
    expect(buildIsoDate(2026, 4, 31)).toBeNull();
  });
});

describe("extractScheduleYear", () => {
  test("finds the first 20xx year in the sheet", () => {
    expect(extractScheduleYear([["Grafikas 2026 m."]])).toBe(2026);
  });

  test("returns null when no year is present", () => {
    expect(extractScheduleYear([["Miestas", "Sausis"]])).toBeNull();
  });
});

describe("extractMonthColumns", () => {
  test("detects month header columns", () => {
    const columns = extractMonthColumns([["Vietovė", "Sausis", "Vasaris"]]);
    expect(columns).toEqual([
      { columnIndex: 1, month: 1, eventType: null },
      { columnIndex: 2, month: 2, eventType: null },
    ]);
  });

  test("infers the event type from the section row above the header", () => {
    const columns = extractMonthColumns([
      ["Pakuotės", "", ""],
      ["Vietovė", "Sausis", "Vasaris"],
    ]);
    expect(columns[0]?.eventType).toBe("Pakuotės");
  });

  test("returns empty when fewer than two month columns exist", () => {
    expect(extractMonthColumns([["Vietovė", "Sausis"]])).toEqual([]);
  });
});

describe("extractDatesFromRow", () => {
  test("builds ISO dates per month column using the default type", () => {
    const result = extractDatesFromRow(
      ["Kalviškės", 5, 12],
      [
        { columnIndex: 1, month: 1, eventType: null },
        { columnIndex: 2, month: 2, eventType: null },
      ],
      2026,
      "Mišrios atliekos",
    );
    expect(result).toEqual([
      { type: "Mišrios atliekos", date: "2026-01-05" },
      { type: "Mišrios atliekos", date: "2026-02-12" },
    ]);
  });

  test("prefers the column event type over the default", () => {
    const result = extractDatesFromRow(
      ["Kalviškės", 5],
      [{ columnIndex: 1, month: 1, eventType: "Stiklas" }],
      2026,
      "Mišrios atliekos",
    );
    expect(result[0]?.type).toBe("Stiklas");
  });
});

describe("inferWasteType", () => {
  test("recognizes mixed and packaging waste from label or url", () => {
    expect(inferWasteType("Buitinės atliekos", "https://x/f.xlsx")).toBe(
      "Mišrios atliekos",
    );
    expect(inferWasteType("Stiklas", "https://x/f.xlsx")).toBe(
      "Pakuotės/Stiklas",
    );
  });

  test("falls back to label then file name", () => {
    expect(inferWasteType("Žalia", "https://x/f.xlsx")).toBe("Žalia");
    expect(inferWasteType("", "https://x/grafikas.xlsx")).toBe("grafikas.xlsx");
  });
});

describe("dedupeEvents", () => {
  test("removes duplicates by type+date+source and sorts by date", () => {
    const link = "https://calendar";
    const events: CalendarEvent[] = [
      { type: "Stiklas", date: "2026-03-20", link, sourceFileUrl: "a", keyword: "k" },
      { type: "Stiklas", date: "2026-03-20", link, sourceFileUrl: "a", keyword: "k" },
      { type: "Stiklas", date: "2026-01-10", link, sourceFileUrl: "a", keyword: "k" },
    ];
    const result = dedupeEvents(events);
    expect(result.map((e) => e.date)).toEqual(["2026-01-10", "2026-03-20"]);
  });
});

describe("createGoogleCalendarLink", () => {
  test("encodes a one-day event spanning the following day", () => {
    const link = createGoogleCalendarLink("Stiklas", "2026-03-20", "Kalviškės");
    expect(link.startsWith("https://www.google.com/calendar/render")).toBe(true);
    expect(link).toContain("dates=20260320/20260321");
  });
});

describe("extractCityCandidates", () => {
  test("returns the locality from the preferred (second) column", () => {
    expect(extractCityCandidates(["1", "Kalviškės"])).toEqual(["Kalviškės"]);
  });

  test("splits multiple localities in one cell", () => {
    expect(extractCityCandidates(["1", "Kalviškės; Vievis"])).toEqual([
      "Kalviškės",
      "Vievis",
    ]);
  });

  test("rejects header labels, numeric cells and lowercase fragments", () => {
    expect(extractCityCandidates(["1", "Atliekų grafikas"])).toEqual([]);
    expect(extractCityCandidates(["1", "Kaunas 2"])).toEqual([]);
    expect(extractCityCandidates(["1", "kaunas"])).toEqual([]);
  });
});
