import * as XLSX from "xlsx";
import { readPdfScheduleRows } from "./pdfSchedule.ts";
import {
  cleanCityDisplayName,
  extractLocalityKeys,
  normalizeText,
  splitCityParts,
  stripParenthesizedText,
  toLocalityKey,
} from "./shared/locality.ts";
import { getEventTypeIcon } from "./shared/waste.ts";

type CellValue = string | number | null | undefined;
type ScheduleFormat = "xlsx" | "pdf";
type FileEntry = { url: string; type: string; format: ScheduleFormat };

type CacheMeta = {
  fetchedAt: number;
  binary: boolean;
};

type CachePaths = {
  dataPath: string;
  metaPath: string;
};

type MonthColumn = {
  columnIndex: number;
  month: number;
  eventType: string | null;
};

export type CacheDiagnostics = {
  cacheDir: string;
  ttlHours: number;
  fileCount: number;
  totalBytes: number;
  latestFetchedAt: string | null;
};

export type CalendarEvent = {
  type: string;
  date: string;
  link: string;
  sourceFileUrl: string;
  keyword: string;
};

export const SOURCE_PAGE_URL = "https://www.nkom.lt/kita.html";

const DEFAULT_YEAR = 2026;
const CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const CACHE_DIR = `${process.cwd()}/.cache/nkom`;

export async function generateCalendarEvents(
  keyword: string,
): Promise<CalendarEvent[]> {
  const files = await getScheduleFilesFromPage(SOURCE_PAGE_URL);
  const normalizedKeyword = normalizeText(keyword);
  const keywordKeys = extractLocalityKeys(keyword);

  const events: CalendarEvent[] = [];
  for (const file of files) {
    const data = await readScheduleRows(file);
    if (!data.length) {
      continue;
    }

    const scheduleYear = extractScheduleYear(data) ?? DEFAULT_YEAR;
    const monthColumns = extractMonthColumns(data);

    for (const row of data) {
      if (!rowIncludesKeyword(row, normalizedKeyword, keywordKeys)) {
        continue;
      }

      const rowEvents = extractDatesFromRow(
        row,
        monthColumns,
        scheduleYear,
        file.type,
      );
      for (const rowEvent of rowEvents) {
        events.push({
          type: rowEvent.type,
          date: rowEvent.date,
          link: createGoogleCalendarLink(rowEvent.type, rowEvent.date, keyword),
          sourceFileUrl: file.url,
          keyword,
        });
      }
    }
  }

  return dedupeEvents(events);
}

async function readCacheFetchedAt(metaPath: string): Promise<number | null> {
  try {
    const meta = JSON.parse(await Bun.file(metaPath).text()) as CacheMeta;
    return typeof meta.fetchedAt === "number" ? meta.fetchedAt : null;
  } catch {
    // Missing or malformed metadata contributes no timestamp.
    return null;
  }
}

export async function getLatestScheduleFetchedAt(): Promise<string | null> {
  const files = await getScheduleFilesFromPage(SOURCE_PAGE_URL);
  const fetchedAtValues: number[] = [];

  for (const file of files) {
    const fetchedAt = await readCacheFetchedAt(getCachePaths(file.url).metaPath);
    if (fetchedAt !== null) {
      fetchedAtValues.push(fetchedAt);
    }
  }

  if (!fetchedAtValues.length) {
    return null;
  }

  return new Date(Math.max(...fetchedAtValues)).toISOString();
}

export async function getAvailableCities(): Promise<string[]> {
  const files = await getScheduleFilesFromPage(SOURCE_PAGE_URL);
  const unique = new Map<string, string>();

  for (const file of files) {
    const data = await readScheduleRows(file);
    if (!data.length) {
      continue;
    }

    for (const row of data) {
      if (!hasScheduleDays(row)) {
        continue;
      }

      const candidates = extractCityCandidates(row);
      for (const candidate of candidates) {
        const normalized = toLocalityKey(candidate);
        if (!unique.has(normalized)) {
          unique.set(normalized, candidate);
        }
      }
    }
  }

  return [...unique.values()].sort((a, b) => a.localeCompare(b, "lt"));
}

export async function getCacheDiagnostics(): Promise<CacheDiagnostics> {
  const entries: Array<{ name: string; size: number }> = [];
  try {
    const glob = new Bun.Glob("*");
    for await (const name of glob.scan({ cwd: CACHE_DIR, onlyFiles: true })) {
      entries.push({ name, size: Bun.file(`${CACHE_DIR}/${name}`).size });
    }
  } catch {
    return {
      cacheDir: CACHE_DIR,
      ttlHours: Math.round(CACHE_TTL_MS / 3600000),
      fileCount: 0,
      totalBytes: 0,
      latestFetchedAt: null,
    };
  }

  const metaFiles = entries.filter((entry) =>
    entry.name.endsWith(".meta.json"),
  );
  const fetchedAtValues: number[] = [];

  for (const metaFile of metaFiles) {
    const fetchedAt = await readCacheFetchedAt(`${CACHE_DIR}/${metaFile.name}`);
    if (fetchedAt !== null) {
      fetchedAtValues.push(fetchedAt);
    }
  }

  const latestFetchedAtMs = fetchedAtValues.length
    ? Math.max(...fetchedAtValues)
    : null;

  return {
    cacheDir: CACHE_DIR,
    ttlHours: Math.round(CACHE_TTL_MS / 3600000),
    fileCount: entries.length,
    totalBytes: entries.reduce((sum, entry) => sum + entry.size, 0),
    latestFetchedAt: latestFetchedAtMs
      ? new Date(latestFetchedAtMs).toISOString()
      : null,
  };
}

async function readScheduleRows(file: FileEntry): Promise<CellValue[][]> {
  const bytes = await fetchBinaryWithCache(file.url);

  if (file.format === "pdf") {
    return dropSharedContainerSection(await readPdfScheduleRows(bytes));
  }

  const workbook = XLSX.read(bytes, { type: "array" });
  const [sheet] = Object.values(workbook?.Sheets ?? {});
  if (!sheet) {
    return [];
  }

  return dropSharedContainerSection(
    XLSX.utils.sheet_to_json(sheet, {
      header: 1,
    }) as CellValue[][],
  );
}

// nkom.lt's source spreadsheet has a trailing tab for shared apartment-block
// container-yard pickups ("... atliekų surinkimas iš (daugiabučių namų)
// bendro naudojimo konteinerių aikštelių") — a different, weekday+week-parity
// schedule (e.g. "Pirmadienis"/"KP1"), not tied to specific calendar dates,
// and irrelevant to this app's per-locality date lookup. XLSX.utils reads
// only the workbook's first sheet, so it never surfaced there, but the PDF
// export concatenates every tab as extra pages, leaking this section (and,
// per a real Q4 2026 PDF, its title landing merged onto the last real data
// row) into the parsed rows. All three tokens are required — "bendro
// naudojimo" alone also appears as an ordinary address suffix ("... bendro
// naudojimo ir įmonės") on genuine schedule rows.
export function dropSharedContainerSection(data: CellValue[][]): CellValue[][] {
  const markerIndex = data.findIndex((row) => {
    const joined = normalizeText(
      row.filter((cell) => typeof cell === "string").join(" "),
    );
    return (
      joined.includes("surinkimas") &&
      joined.includes("bendro naudojimo") &&
      joined.includes("aikstel")
    );
  });

  return markerIndex === -1 ? data : data.slice(0, markerIndex);
}

function rowIncludesKeyword(
  row: CellValue[],
  normalizedKeyword: string,
  keywordKeys: Set<string>,
): boolean {
  if (!normalizedKeyword) {
    return false;
  }

  return row.some((cell) => {
    if (typeof cell !== "string") {
      return false;
    }

    const normalizedCell = normalizeText(stripParenthesizedText(cell));
    if (normalizedCell.includes(normalizedKeyword)) {
      return true;
    }

    if (!keywordKeys.size) {
      return false;
    }

    const cellKeys = extractLocalityKeys(cell);
    for (const key of keywordKeys) {
      if (cellKeys.has(key)) {
        return true;
      }
    }

    return false;
  });
}

// Substrings that mark a cell as a column header / waste-type label rather than
// a locality, so such cells are excluded from the city list.
const CITY_NAME_BLACKLIST = [
  "atliek",
  "grafik",
  "seniun",
  "stikl",
  "pakuot",
  "plast",
  "kalend",
  "menuo",
  "marsrut",
  "uab",
  "komunalinink",
];

// Lithuanian locality names start with an uppercase letter (incl. diacritics).
const CITY_NAME_INITIAL = /^[A-Z\u0104\u010C\u0118\u0116\u012E\u0160\u0172\u016A\u017D]/;

// A cell's street sublist is normally wrapped in its own parentheses (already
// dropped by stripParenthesizedText before this runs), but some source rows
// list street names as plain unparenthesized items instead, trailed by the
// "g." (gatv\u0117/street) abbreviation \u2014 e.g. "Lauko g., Lenk\u0173 g., Mick\u016Bn\u0173 g.".
// A genuine locality name never ends in that standalone abbreviation, so it's
// a reliable way to catch this case too.
const STREET_ABBREVIATION_ENDING = /(?:^|\s)g$/;

function isPlausibleCityName(cleaned: string): boolean {
  const normalized = normalizeText(cleaned);
  if (normalized.length < 3 || normalized.length > 40) {
    return false;
  }

  if (CITY_NAME_BLACKLIST.some((token) => normalized.includes(token))) {
    return false;
  }

  if (STREET_ABBREVIATION_ENDING.test(normalized)) {
    return false;
  }

  if (!CITY_NAME_INITIAL.test(cleaned)) {
    return false;
  }

  return cleaned.split(/\s+/).filter(Boolean).length <= 3;
}

function pickCityCell(row: CellValue[]): string | undefined {
  // The second column usually holds the locality; otherwise fall back to the
  // first non-empty text cell in the row.
  const second = row[1];
  if (typeof second === "string" && second.trim()) {
    return second;
  }

  return row.find(
    (cell): cell is string => typeof cell === "string" && Boolean(cell.trim()),
  );
}

export function extractCityCandidates(row: CellValue[]): string[] {
  const preferredCell = pickCityCell(row);
  if (!preferredCell) {
    return [];
  }

  const sanitized = stripParenthesizedText(preferredCell)
    .replace(/\s+/g, " ")
    .trim();
  if (!sanitized || /\d/.test(sanitized)) {
    return [];
  }

  const candidates = new Set<string>();
  for (const part of splitCityParts(sanitized)) {
    const cleaned = cleanCityDisplayName(part);
    if (cleaned && isPlausibleCityName(cleaned)) {
      candidates.add(cleaned);
    }
  }

  return [...candidates];
}

function hasScheduleDays(row: CellValue[]): boolean {
  return row.some((cell) => parseDays(cell).length > 0);
}

async function getScheduleFilesFromPage(pageUrl: string): Promise<FileEntry[]> {
  const html = await fetchTextWithCache(pageUrl);
  const anchorRegex =
    /<a\b[^>]*href\s*=\s*["']([^"']+\.(?:xlsx|pdf))(\?[^"']*)?["'][^>]*>([\s\S]*?)<\/a>/gi;

  const files: FileEntry[] = [];
  const seenUrls = new Set<string>();

  for (const match of html.matchAll(anchorRegex)) {
    const href = match[1];
    const rawText = match[3];
    if (!href) {
      continue;
    }

    const absoluteUrl = new URL(href, pageUrl).toString();
    if (seenUrls.has(absoluteUrl)) {
      continue;
    }

    seenUrls.add(absoluteUrl);
    const label = rawText ? stripHtml(rawText).trim() : "";
    const format: ScheduleFormat = absoluteUrl.toLowerCase().endsWith(".pdf") ? "pdf" : "xlsx";
    files.push({
      url: absoluteUrl,
      type: inferWasteType(label, absoluteUrl),
      format,
    });
  }

  return preferXlsxOverPdf(files);
}

// The site sometimes publishes the same quarter's schedule in both formats
// (an "XLSX formatu" / "PDF formatu" link pair pointing at different files),
// and PDF should only be used as a fallback when no XLSX exists for that
// same waste type + quarter. Files are grouped by that key and, within each
// group, XLSX entries win whenever any exist.
function preferXlsxOverPdf(files: FileEntry[]): FileEntry[] {
  const order: string[] = [];
  const groups = new Map<string, FileEntry[]>();

  for (const file of files) {
    const key = scheduleGroupKey(file);
    if (!groups.has(key)) {
      order.push(key);
      groups.set(key, []);
    }
    groups.get(key)?.push(file);
  }

  const result: FileEntry[] = [];
  for (const key of order) {
    const group = groups.get(key) ?? [];
    const xlsxEntries = group.filter((file) => file.format === "xlsx");
    result.push(...(xlsxEntries.length ? xlsxEntries : group));
  }
  return result;
}

function scheduleGroupKey(file: FileEntry): string {
  const decodedUrl = decodeUrlSafely(file.url);
  const quarterMatch = decodedUrl.match(/\((\d{1,2}\s*-\s*\d{1,2})\)/);
  const discriminator = quarterMatch?.[1]
    ? quarterMatch[1].replace(/\s+/g, "")
    : decodedUrl.replace(/\.(?:xlsx|pdf)(?:\?.*)?$/i, "");
  return `${file.type}|${discriminator}`;
}

function decodeUrlSafely(url: string): string {
  try {
    return decodeURIComponent(url);
  } catch {
    return url;
  }
}

export function dedupeEvents(events: CalendarEvent[]): CalendarEvent[] {
  const unique = new Map<string, CalendarEvent>();
  for (const event of events) {
    const key = `${event.type}|${event.date}|${event.sourceFileUrl}`;
    if (!unique.has(key)) {
      unique.set(key, event);
    }
  }

  return [...unique.values()].sort((a, b) => a.date.localeCompare(b.date));
}

async function fetchTextWithCache(url: string): Promise<string> {
  const cachePaths = getCachePaths(url);
  const cached = await readFromCache(cachePaths, false);
  if (cached !== null && typeof cached === "string") {
    return cached;
  }

  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Nepavyko gauti puslapio: HTTP ${response.status}`);
  }

  const text = await response.text();
  await writeToCache(cachePaths, text, false);
  return text;
}

async function fetchBinaryWithCache(url: string): Promise<Uint8Array> {
  const cachePaths = getCachePaths(url);
  const cached = await readFromCache(cachePaths, true);
  if (cached !== null && cached instanceof Uint8Array) {
    return cached;
  }

  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`HTTP ${response.status} ${response.statusText}`);
  }

  const bytes = new Uint8Array(await response.arrayBuffer());
  await writeToCache(cachePaths, bytes, true);
  return bytes;
}

function getCachePaths(url: string): CachePaths {
  const key = new Bun.CryptoHasher("sha256").update(url).digest("hex");
  return {
    dataPath: `${CACHE_DIR}/${key}.data`,
    metaPath: `${CACHE_DIR}/${key}.meta.json`,
  };
}

async function readFromCache(
  cachePaths: CachePaths,
  binary: boolean,
): Promise<string | Uint8Array | null> {
  try {
    const meta = JSON.parse(
      await Bun.file(cachePaths.metaPath).text(),
    ) as CacheMeta;

    if (meta.binary !== binary) {
      return null;
    }

    if (Date.now() - meta.fetchedAt > CACHE_TTL_MS) {
      return null;
    }

    const data = Bun.file(cachePaths.dataPath);
    return binary ? new Uint8Array(await data.arrayBuffer()) : await data.text();
  } catch {
    return null;
  }
}

// Bun.write creates parent directories as needed, so no explicit mkdir.
async function writeToCache(
  cachePaths: CachePaths,
  value: string | Uint8Array,
  binary: boolean,
): Promise<void> {
  await Bun.write(cachePaths.dataPath, value);
  await Bun.write(
    cachePaths.metaPath,
    JSON.stringify({ fetchedAt: Date.now(), binary }),
  );
}

function stripHtml(value: string): string {
  return value
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/\s+/g, " ");
}

export function inferWasteType(label: string, url: string): string {
  // Diacritic-insensitive: newer links are often labeled generically ("PDF
  // formatu") with no descriptive text, so the waste type has to be read off
  // the filename instead (e.g. "Grafikas mišrių ... .pdf"), which keeps its
  // proper Lithuanian diacritics unlike the older ASCII-transliterated names.
  // The URL is percent-encoded, so it has to be decoded before diacritics
  // (themselves multi-byte, percent-encoded sequences) can be stripped.
  const source = normalizeText(`${label} ${decodeUrlSafely(url)}`);

  if (source.includes("buit") || source.includes("misr")) {
    return "Mišrios atliekos";
  }

  if (source.includes("pakuoc") || source.includes("stikl")) {
    return "Pakuotės/Stiklas";
  }

  return label || url.split("/").pop() || "Nežinomas tipas";
}

export function extractScheduleYear(data: CellValue[][]): number | null {
  for (const row of data) {
    for (const cell of row) {
      if (typeof cell !== "string") {
        continue;
      }

      const match = cell.match(/\b(20\d{2})\b/);
      if (match) {
        return Number(match[1]);
      }
    }
  }

  return null;
}

export function extractMonthColumns(data: CellValue[][]): MonthColumn[] {
  const { entries, rowIndex: headerRowIndex } = findMonthHeaderRow(data);
  if (entries.length < 2) {
    return [];
  }

  const headerRow = data[headerRowIndex] ?? [];
  const sectionRow = headerRowIndex > 0 ? data[headerRowIndex - 1] : undefined;
  const eventTypes = resolveEventTypes(entries, headerRow, sectionRow);

  return entries.map(([columnIndex, month], i) => ({
    columnIndex,
    month,
    eventType: eventTypes[i] ?? null,
  }));
}

// The header row is whichever row carries the most recognizable month names —
// picked over any fixed row index since XLSX and PDF exports don't agree on
// how many rows precede it.
function findMonthHeaderRow(
  data: CellValue[][],
): { entries: Array<[number, number]>; rowIndex: number } {
  let bestRowMonths = new Map<number, number>();
  let bestRowIndex = -1;

  data.forEach((row, rowIndex) => {
    const rowMonths = new Map<number, number>();

    row.forEach((cell, columnIndex) => {
      const month = getMonthNumber(cell);
      if (month !== null) {
        rowMonths.set(columnIndex, month);
      }
    });

    if (rowMonths.size > bestRowMonths.size) {
      bestRowMonths = rowMonths;
      bestRowIndex = rowIndex;
    }
  });

  return {
    entries: [...bestRowMonths.entries()].sort((a, b) => a[0] - b[0]),
    rowIndex: bestRowIndex,
  };
}

// The PDF export (unlike XLSX) has no separate section row above the
// header: a waste-type label like "Plastiko, popieriaus ir metalinės
// pakuotės" is drawn as its own merged cell spanning a group of month
// columns, and lands — via the column's start-x — inside whichever month
// cell it happens to overlap (observed: the group's middle month), so it
// ends up concatenated onto that one header cell's own text rather than
// sitting in a row of its own. So a column's own header cell is checked
// first; only once no column in its repeating-month group carries a label
// does the row above the header get consulted (the older XLSX-style
// layout, where the label truly is a separate row).
function resolveEventTypes(
  entries: Array<[number, number]>,
  headerRow: CellValue[],
  sectionRow: CellValue[] | undefined,
): Array<string | null> {
  const ownTypes = entries.map(([columnIndex]) =>
    classifyWasteTypeLabel(headerRow[columnIndex]),
  );
  fillRepeatingMonthGroups(
    ownTypes,
    entries.map(([, month]) => month),
  );

  return entries.map(
    ([columnIndex], i) =>
      ownTypes[i] ??
      (sectionRow ? inferEventTypeFromSectionRow(sectionRow, columnIndex) : null),
  );
}

// A header row can bundle several waste-type sections that each repeat the
// same month sequence (e.g. Spalis/Lapkritis/Gruodis once for "Plastiko,
// popieriaus ir metalinės pakuotės" and again for "Stiklo pakuotės"). A new
// section starts wherever the month sequence stops increasing; within a
// section, any column's own label is propagated to its label-less siblings.
function fillRepeatingMonthGroups(
  types: Array<string | null>,
  months: number[],
): void {
  let groupStart = 0;
  for (let i = 1; i <= months.length; i++) {
    const isBoundary =
      i === months.length || (months[i] ?? 0) <= (months[i - 1] ?? 0);
    if (!isBoundary) {
      continue;
    }

    const label = types.slice(groupStart, i).find((type) => type !== null);
    if (label) {
      for (let j = groupStart; j < i; j++) {
        types[j] ??= label;
      }
    }
    groupStart = i;
  }
}

function classifyWasteTypeLabel(value: CellValue): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const normalized = normalizeText(value).trim();
  if (!normalized) {
    return null;
  }

  if (normalized.includes("stikl")) {
    return "Stiklas";
  }

  if (
    normalized.includes("pakuot") ||
    normalized.includes("plast") ||
    normalized.includes("popier") ||
    normalized.includes("metal")
  ) {
    return "Pakuotės";
  }

  return null;
}

function inferEventTypeFromSectionRow(
  sectionRow: CellValue[],
  columnIndex: number,
): string | null {
  for (let cursor = columnIndex; cursor >= 0; cursor -= 1) {
    const value = sectionRow[cursor];
    if (typeof value !== "string" || !value.trim()) {
      continue;
    }

    return classifyWasteTypeLabel(value);
  }

  return null;
}

const MONTH_TOKENS: ReadonlyArray<readonly [string, number]> = [
  ["saus", 1],
  ["vasar", 2],
  ["kov", 3],
  ["baland", 4],
  ["geguz", 5],
  ["birzel", 6],
  ["liep", 7],
  ["rugpj", 8],
  ["rugsej", 9],
  ["spal", 10],
  ["lapkr", 11],
  ["gruod", 12],
];

export function getMonthNumber(value: CellValue): number | null {
  if (typeof value !== "string") {
    return null;
  }

  const normalized = normalizeText(value);
  for (const [token, month] of MONTH_TOKENS) {
    if (normalized.includes(token)) {
      return month;
    }
  }

  return null;
}

export function extractDatesFromRow(
  row: CellValue[],
  monthColumns: MonthColumn[],
  year: number,
  defaultType: string,
): Array<{ type: string; date: string }> {
  const dates = new Map<string, { type: string; date: string }>();

  for (const column of monthColumns) {
    const days = parseDays(row[column.columnIndex]);
    for (const day of days) {
      const date = buildIsoDate(year, column.month, day);
      if (date) {
        const eventType = column.eventType ?? defaultType;
        dates.set(`${eventType}|${date}`, { type: eventType, date });
      }
    }
  }

  return [...dates.values()].sort((a, b) => a.date.localeCompare(b.date));
}

function isValidDay(day: number): boolean {
  return Number.isInteger(day) && day >= 1 && day <= 31;
}

export function parseDays(value: CellValue): number[] {
  if (typeof value === "number") {
    return isValidDay(value) ? [value] : [];
  }

  if (typeof value !== "string") {
    return [];
  }

  const matches = value.match(/(?<!\d)\d{1,2}(?!\d)/g);
  if (!matches) {
    return [];
  }

  const days = new Set<number>();
  for (const token of matches) {
    const day = Number(token);
    if (isValidDay(day)) {
      days.add(day);
    }
  }

  return [...days].sort((a, b) => a - b);
}

export function buildIsoDate(year: number, month: number, day: number): string | null {
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() + 1 !== month ||
    date.getUTCDate() !== day
  ) {
    return null;
  }

  return formatDate(date);
}

function formatDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function createGoogleCalendarLink(
  type: string,
  date: string,
  keyword: string,
): string {
  const base = "https://www.google.com/calendar/render?action=TEMPLATE";
  const icon = getEventTypeIcon(type);
  const eventName = encodeURIComponent(`${icon} Šiukšlių išvežimas: ${type}`);
  const details = encodeURIComponent(
    `NKOM ${type} ${SOURCE_PAGE_URL}\nNepamirškite atsinaujinti: https://nkom.coders.lt/?city=${keyword}`,
  );
  const dateStr = date.replace(/-/g, "");
  const nextDay = new Date(new Date(date).getTime() + 86400000)
    .toISOString()
    .slice(0, 10)
    .replace(/-/g, "");

  return `${base}&text=${eventName}&dates=${dateStr}/${nextDay}&details=${details}`;
}
