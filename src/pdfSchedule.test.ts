import { describe, expect, test } from "bun:test";
import {
  extractDatesFromRow,
  extractMonthColumns,
  extractScheduleYear,
  parseDays,
} from "./nkomService.ts";
import { groupLinesIntoRows, readPdfScheduleRows, type Item } from "./pdfSchedule.ts";

const FIXTURE_PATH = `${import.meta.dir}/fixtures/nkom-schedule-sample.pdf`;

// Builds one physical line's worth of Items, one per (column, text) pair.
function line(...values: Array<[column: number, str: string]>): Item[] {
  return values.map(([column, str]) => ({ column, x: 0, y: 0, str }));
}

describe("readPdfScheduleRows", () => {
  test("rebuilds the header row and a wrapped-cell data row from the vector table grid", async () => {
    const bytes = new Uint8Array(await Bun.file(FIXTURE_PATH).arrayBuffer());
    const rows = await readPdfScheduleRows(bytes);

    expect(rows).toEqual([
      [
        "",
        'UAB "Nemėžio komunalininkas" 2026 m. spalio - gruodžio mėnesių buitinių mišrių atliekų surinkimo grafikas',
        "",
        "",
        "",
        "",
        "",
      ],
      ["Seniūnija", "Vietovė", "Sav. diena", "Spalis", "Lapkritis", "Gruodis", "Maršrutas"],
      [
        "Marijampolio",
        'Juočikiai, Mikalinė (Miško g.), Naujieji Piktakonys, Piktakonys, SB “Rasa“- Piktakonių k., Pakovarniškės, Užupėnai, Zasčiūnai, Žalioji, Migūnai (SB“Migūnai", SB “Rimtis“) Raguvėlė, Skibiškės, Užuglobis',
        "Kas antrą trečiadienį",
        "7, 21",
        "4, 18",
        "2, 16,30",
        "MRY 451",
      ],
      [
        "Mickūnų",
        "Akmenynė, Dėdoniškės, Mažeikiai (be Kairėnų ir Girios g.), Gaidūnai, Linkos, Milašinė, Mickūnų geležinkelio st., Naujakiemis, Plotai, Popierinė, Sankeliai, Taurija, Žagariškės, Rokantai, Mickūnų mstl. (Gaidūnų g., Jonažolių g., Paparčių g., Užupio g., Ąžuolų g.)",
        "Kas antrą trečiadienį",
        "7, 21",
        "4, 18",
        "2, 16,30",
        "NCY 851",
      ],
      [
        "Mickūnų",
        "Uosininkai I, Uosininkai II, Uosininkai III, Mickūnų mstl. (Miško, Pirties, Mokytojų g.)",
        "Kas antrą trečiadienį",
        "7, 21",
        "4, 18",
        "2, 16, 30",
        "MJA 179",
      ],
      ["Nemėžio", "Daržininkai, Talkotiškės, Paliepiai, Pagrūšys", "Kas antrą trečiadienį", "7, 21", "4, 18", "2, 16, 30", "KMJ 481"],
      [
        "Nemėžio",
        "Kuprioniškės, Ašmenos kelias (Vilties g.), Nemėžis (Kaštonų, Mėnulio, Topolių, Draugystės, Šveicarų, Naujakurių, Ąžuolyno g.)",
        "Kas antrą trečiadienį",
        "7, 21",
        "4, 18",
        "2, 16, 30",
        "MJN 664",
      ],
      [
        "Pagirių",
        "Vaira (Vyšnelių g. (bendri)), Mikašiūnai (Paukščių g. (bendri)).",
        "Kas antrą trečiadienį",
        "7, 21",
        "4, 18",
        "2, 16, 30",
        "MJA 179",
      ],
      ["Rudaminos", "Šveicarai, Daubėnai (visi)", "Kas antrą trečiadienį", "7, 21", "4, 18", "2, 16, 30", "NSC 240"],
      ["Rukainių", "Juodiškės, Tilteliai (visi)", "Kas antrą trečiadienį", "7, 21", "4, 18", "2, 16, 30", "NSC 240"],
      [
        "Juodšilių",
        "Juodšiliai (M. Sopočkos, Ežerų, Pergalės, Žalioji, Slėnio, Šilo), Baraškos, Valčiūnai, Miškiniai",
        "Kas antrą penktadienį",
        "2, 16, 30",
        "13, 27",
        "11, 25",
        "MRY 451",
      ],
      ["Marijampolio", "Akmeniškės", "Kas antrą penktadienį", "2, 16, 30", "13, 27", "11, 25", "MJA 179"],
      [
        "Nemėžio",
        'Stankutiškės, Skaidiškės (Rudaminos, Gamyklos, Miško, Taikos, Šv. Faustinos, Vieversių, Gėlių, Statybininkų, Palydovo, Ievų, Pakalnės, Raktažolių, Viensėdžio g., Linų g., Dunaikos g., Vaisių g., Stirnų g., Klebniškių g., SB "Skaistė")',
        "Kas antrą penktadienį",
        "2, 16, 30",
        "13, 27",
        "11, 25",
        "NCY 851",
      ],
    ]);
  });

  test("output plugs into the same row parsers used for XLSX sheets", async () => {
    const bytes = new Uint8Array(await Bun.file(FIXTURE_PATH).arrayBuffer());
    const rows = await readPdfScheduleRows(bytes);

    expect(extractScheduleYear(rows)).toBe(2026);

    const monthColumns = extractMonthColumns(rows);
    expect(monthColumns.map((c) => c.month)).toEqual([10, 11, 12]);

    const marijampolioRow = rows[2];
    if (!marijampolioRow) {
      throw new Error("expected a data row");
    }
    expect(parseDays(marijampolioRow[3])).toEqual([7, 21]);

    const events = extractDatesFromRow(marijampolioRow, monthColumns, 2026, "Mišrios atliekos");
    expect(events).toEqual([
      { type: "Mišrios atliekos", date: "2026-10-07" },
      { type: "Mišrios atliekos", date: "2026-10-21" },
      { type: "Mišrios atliekos", date: "2026-11-04" },
      { type: "Mišrios atliekos", date: "2026-11-18" },
      { type: "Mišrios atliekos", date: "2026-12-02" },
      { type: "Mišrios atliekos", date: "2026-12-16" },
      { type: "Mišrios atliekos", date: "2026-12-30" },
    ]);
  });
});

describe("groupLinesIntoRows", () => {
  const COLUMN_COUNT = 7; // Seniūnija, Vietovė, Sav. diena, 3 months, Maršrutas

  test("does not merge two back-to-back single-line rows that never wrap", () => {
    // Real nkom.lt PDFs hit this: when neither row's Vietovė nor Sav. diena
    // needs to wrap, there's no wrap-only line separating them, so they sit
    // on immediately consecutive physical lines — previously misread as one
    // multi-line row (see the "Kalvelių Lavoriškių Marijampolio..." mangling
    // this fixed, in [[pdf-schedule-fallback]]).
    const lines = [
      line([0, "Kalvelių"], [1, "Kalvelių k. (Sodų g. 18)"], [2, "Kas antrą antradienį"], [6, "NCY 851"]),
      line([0, "Lavoriškių"], [1, "Lavoriškių k., Vilniaus g. 24"], [2, "Kas antrą ketvirtadienį"], [6, "MRY 481"]),
    ];

    expect(groupLinesIntoRows(lines, COLUMN_COUNT)).toEqual([
      ["Kalvelių", "Kalvelių k. (Sodų g. 18)", "Kas antrą antradienį", "", "", "", "NCY 851"],
      ["Lavoriškių", "Lavoriškių k., Vilniaus g. 24", "Kas antrą ketvirtadienį", "", "", "", "MRY 481"],
    ]);
  });

  test("still merges a section-label line into the header row it has no Seniūnija of its own to compete with", () => {
    // The PDF-only packaging schedule draws a waste-type label ("Plastiko,
    // popieriaus ir metalinės pakuotės") as its own line above the month
    // names, landing in one of the month columns rather than a row of its
    // own — this merge must survive so extractMonthColumns can still read
    // the label back off that header cell.
    const lines = [
      line([4, "Plastiko, popieriaus ir metalinės pakuotės"]),
      line([0, "Seniūnija"], [1, "Vietovė"], [3, "Spalis"], [4, "Lapkritis"], [5, "Gruodis"], [6, "Maršrutas"]),
    ];

    expect(groupLinesIntoRows(lines, COLUMN_COUNT)).toEqual([
      ["Seniūnija", "Vietovė", "", "Spalis", "Plastiko, popieriaus ir metalinės pakuotės Lapkritis", "Gruodis", "Maršrutas"],
    ]);
  });

  test("still merges a wrapped Maršrutas continuation that carries no Seniūnija of its own", () => {
    const lines = [
      line([0, "Rukainių"], [1, "Voverių k. 1"], [2, "Kas antrą ketvirtadienį"], [6, "KMJ 481"]),
      line([6, "(9)"]),
    ];

    expect(groupLinesIntoRows(lines, COLUMN_COUNT)).toEqual([
      ["Rukainių", "Voverių k. 1", "Kas antrą ketvirtadienį", "", "", "", "KMJ 481 (9)"],
    ]);
  });
});
