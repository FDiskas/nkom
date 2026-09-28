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

    expect(groupLinesIntoRows(lines, COLUMN_COUNT, true)).toEqual([
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

    expect(groupLinesIntoRows(lines, COLUMN_COUNT, true)).toEqual([
      ["Seniūnija", "Vietovė", "", "Spalis", "Plastiko, popieriaus ir metalinės pakuotės Lapkritis", "Gruodis", "Maršrutas"],
    ]);
  });

  test("still merges a wrapped Maršrutas continuation that carries no Seniūnija of its own", () => {
    const lines = [
      line([0, "Rukainių"], [1, "Voverių k. 1"], [2, "Kas antrą ketvirtadienį"], [6, "KMJ 481"]),
      line([6, "(9)"]),
    ];

    expect(groupLinesIntoRows(lines, COLUMN_COUNT, true)).toEqual([
      ["Rukainių", "Voverių k. 1", "Kas antrą ketvirtadienį", "", "", "", "KMJ 481 (9)"],
    ]);
  });

  // Vietovė wraps independently of a row's other columns (see the module doc
  // comment), so a long parenthesized street list's tail line can land
  // vertically closer to the NEXT row's anchor than to its own — this must
  // not glue that tail's street names onto the next row's locality.
  function withY(y: number, items: Item[]): Item[] {
    return items.map((item) => ({ ...item, y }));
  }

  test("keeps a wrapped Vietovė continuation on its own row even when it sits closer to the next row's anchor", () => {
    const lines = [
      withY(
        100,
        line(
          [0, "Mickūnai"],
          [1, "Mickūnai (Darželių, Mokyklos, Mokytojų,"],
          [2, "Kas antrą trečiadienį"],
          [6, "NCY 851"],
        ),
      ),
      withY(50, line([1, "Miško, Pirties g.),"])),
      withY(
        40,
        line(
          [0, "Nemėžio"],
          [1, "Kuprioniškės"],
          [2, "Kas antrą trečiadienį"],
          [6, "MJN 664"],
        ),
      ),
    ];

    expect(groupLinesIntoRows(lines, COLUMN_COUNT, true)).toEqual([
      [
        "Mickūnai",
        "Mickūnai (Darželių, Mokyklos, Mokytojų, Miško, Pirties g.),",
        "Kas antrą trečiadienį",
        "",
        "",
        "",
        "NCY 851",
      ],
      ["Nemėžio", "Kuprioniškės", "Kas antrą trečiadienį", "", "", "", "MJN 664"],
    ]);
  });

  test("gives up pinning to an open paren once it has spanned more than one other row, instead of swallowing the rest of the document", () => {
    // Source PDFs sometimes really do have an unclosed "(" (a typo in the
    // schedule itself), not just one split across a wrap. That must not hold
    // its row open forever — only the immediately next row's anchor is
    // tolerated before falling back to plain y-distance.
    const lines = [
      withY(100, line([0, "Aaa"], [1, "Aaa (Street1,"])),
      withY(90, line([0, "Bbb"])),
      withY(80, line([0, "Ccc"])),
      withY(79, line([1, "Cstreet"])),
    ];

    expect(groupLinesIntoRows(lines, COLUMN_COUNT, true)).toEqual([
      ["Aaa", "Aaa (Street1,", "", "", "", "", ""],
      ["Bbb", "", "", "", "", "", ""],
      ["Ccc", "Cstreet", "", "", "", "", ""],
    ]);
  });

  test("folds a page-leading Vietovė wrap into its row instead of orphaning it, on every page but the first", () => {
    // Real nkom.lt PDFs hit this: a row's Vietovė wraps ABOVE its own anchor
    // line (Seniūnija sits vertically centered in the wrapped block), and
    // when that row happens to be the first one on a page, its leading wrap
    // line is indistinguishable — by position alone — from a page 1 title
    // sitting above the header row. Only page 1 can have a real title, so
    // later pages must fold this leading wrap into the row it belongs to.
    const lines = [
      line([1, "Pagiriai (Šiltnamių, Kalno g.,"]),
      line([0, "Pagirių"], [3, "13, 27"], [6, "GDL 454"]),
      line([1, "Kaštonų g., Žilvyčių g.)"], [2, "antradienį"]),
      line([0, "Nemėžio"], [3, "7, 21"], [6, "MJN 664"]),
    ];

    expect(groupLinesIntoRows(lines, COLUMN_COUNT, false)).toEqual([
      ["Pagirių", "Pagiriai (Šiltnamių, Kalno g., Kaštonų g., Žilvyčių g.)", "antradienį", "13, 27", "", "", "GDL 454"],
      ["Nemėžio", "", "", "7, 21", "", "", "MJN 664"],
    ]);
  });

  test("still treats a leading wrap-only line as a title/preamble row on the actual first page", () => {
    const lines = [
      line([1, 'UAB "Nemėžio komunalininkas" 2026 m. grafikas']),
      line([0, "Seniūnija"], [1, "Vietovė"], [3, "Spalis"], [6, "Maršrutas"]),
      line([0, "Pagirių"], [1, "Kalviai"], [3, "7, 21"], [6, "GDL 454"]),
    ];

    expect(groupLinesIntoRows(lines, COLUMN_COUNT, true)).toEqual([
      ["", 'UAB "Nemėžio komunalininkas" 2026 m. grafikas', "", "", "", "", ""],
      ["Seniūnija", "Vietovė", "", "Spalis", "", "", "Maršrutas"],
      ["Pagirių", "Kalviai", "", "7, 21", "", "", "GDL 454"],
    ]);
  });
});
