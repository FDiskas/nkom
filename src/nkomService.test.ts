import { describe, expect, test } from "bun:test";
import {
  type CalendarEvent,
  buildIsoDate,
  createGoogleCalendarLink,
  dedupeEvents,
  dropSharedContainerSection,
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

  // The PDF-derived packaging schedule has no separate section row: its two
  // waste-type sections repeat the same three months, and each section's
  // label is merged onto its own middle month cell rather than sitting in a
  // row above the header (see src/pdfSchedule.ts's row-reconstruction notes).
  test("splits repeating month groups by the label merged onto one of their own header cells", () => {
    const columns = extractMonthColumns([
      [
        "Seniūnija",
        "Vietovė",
        "Spalis",
        "Plastiko, popieriaus ir metalinės pakuotės Lapkritis",
        "Gruodis",
        "Spalis",
        "Stiklo pakuotės Lapkritis",
        "Gruodis",
        "Maršrutas",
      ],
    ]);

    expect(columns).toEqual([
      { columnIndex: 2, month: 10, eventType: "Pakuotės" },
      { columnIndex: 3, month: 11, eventType: "Pakuotės" },
      { columnIndex: 4, month: 12, eventType: "Pakuotės" },
      { columnIndex: 5, month: 10, eventType: "Stiklas" },
      { columnIndex: 6, month: 11, eventType: "Stiklas" },
      { columnIndex: 7, month: 12, eventType: "Stiklas" },
    ]);
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

  test("reads the type from a percent-encoded filename when the link label is generic", () => {
    // Newer "PDF formatu" / "XLSX formatu" links carry no descriptive label,
    // so the type has to come from the (percent-encoded, diacritic) filename.
    expect(
      inferWasteType(
        "PDF formatu",
        "https://x/Grafikas%20mi%C5%A1ri%C5%B3%202026.pdf",
      ),
    ).toBe("Mišrios atliekos");
    expect(
      inferWasteType(
        "PDF formatu",
        "https://x/Grafikas%20pakuo%C4%8Di%C5%B3%202026.pdf",
      ),
    ).toBe("Pakuotės/Stiklas");
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

  test("rejects street names left unparenthesized in the source row", () => {
    // Some rows list a street sublist as plain comma-separated items instead
    // of wrapping it in its own parentheses, so stripParenthesizedText never
    // sees it — each item ends in "g." (gatvė/street), which a genuine
    // locality name never does.
    expect(
      extractCityCandidates(["1", "Lauko g., Lenkų g., Mickūnų g., Mažeikiai"]),
    ).toEqual(["Mažeikiai"]);
  });
});

describe("dropSharedContainerSection", () => {
  // The source spreadsheet has a trailing tab for shared apartment-block
  // container-yard pickups, a different weekday+week-parity schedule
  // unrelated to this app's per-locality dates. The PDF export concatenates
  // every tab as extra pages, so it has to be dropped from the parsed rows.
  test("drops the shared-container-yard section and everything after it", () => {
    const data = [
      ["Kalviškės", "5", "12"],
      ["Vievis", "3", "9"],
      [
        "",
        'UAB "Nemėžio komunalininkas" Buitinių atliekų surinkimas iš bendro naudojimo konteinerių aikštelių',
      ],
      ["Seniūnija", "Vietovė", "Sav. diena"],
      ["Juodšilių", "Juodšilių k.", "Trečiadieniais"],
    ];

    expect(dropSharedContainerSection(data)).toEqual([
      ["Kalviškės", "5", "12"],
      ["Vievis", "3", "9"],
    ]);
  });

  test("does not misfire on an ordinary address ending in the same words", () => {
    // A real Vietovė entry can legitimately end in "... bendro naudojimo ir
    // įmonės" ("... shared-use areas and businesses") — that alone must not
    // trigger the cut, or it silently deletes every row after it.
    const data = [
      [
        "Pagirių",
        "Keturiasdešimt Totoriai (Vytauto g.), Pagiriai, Vaidotai, bendro naudojimo ir įmonės",
        "Kas antrą trečiadienį",
        "14, 28",
      ],
      ["Kalviškės", "5", "12"],
    ];

    expect(dropSharedContainerSection(data)).toEqual(data);
  });

  test("returns the data unchanged when the section is absent", () => {
    const data = [["Kalviškės", "5", "12"]];
    expect(dropSharedContainerSection(data)).toEqual(data);
  });
});
