import * as XLSX from "xlsx";
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
type FileEntry = { url: string; type: string };

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
  const files = await getXlsxFilesFromPage(SOURCE_PAGE_URL);
  const normalizedKeyword = normalizeText(keyword);
  const keywordKeys = extractLocalityKeys(keyword);

  const events: CalendarEvent[] = [];
  for (const file of files) {
    const data = await readFirstSheetRows(file.url);
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

export async function getLatestXlsxFetchedAt(): Promise<string | null> {
  const files = await getXlsxFilesFromPage(SOURCE_PAGE_URL);
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
  const files = await getXlsxFilesFromPage(SOURCE_PAGE_URL);
  const unique = new Map<string, string>();

  for (const file of files) {
    const data = await readFirstSheetRows(file.url);
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

async function readFirstSheetRows(fileUrl: string): Promise<CellValue[][]> {
  const workbookBytes = await fetchBinaryWithCache(fileUrl);
  const workbook = XLSX.read(workbookBytes, { type: "array" });
  const [sheet] = Object.values(workbook?.Sheets ?? {});
  if (!sheet) {
    return [];
  }

  return XLSX.utils.sheet_to_json(sheet, {
    header: 1,
  }) as CellValue[][];
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

function isPlausibleCityName(cleaned: string): boolean {
  const normalized = normalizeText(cleaned);
  if (normalized.length < 3 || normalized.length > 40) {
    return false;
  }

  if (CITY_NAME_BLACKLIST.some((token) => normalized.includes(token))) {
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

async function getXlsxFilesFromPage(pageUrl: string): Promise<FileEntry[]> {
  const html = await fetchTextWithCache(pageUrl);
  const anchorRegex =
    /<a\b[^>]*href\s*=\s*["']([^"']+\.xlsx(?:\?[^"']*)?)["'][^>]*>([\s\S]*?)<\/a>/gi;

  const files: FileEntry[] = [];
  const seenUrls = new Set<string>();

  for (const match of html.matchAll(anchorRegex)) {
    const href = match[1];
    const rawText = match[2];
    if (!href) {
      continue;
    }

    const absoluteUrl = new URL(href, pageUrl).toString();
    if (seenUrls.has(absoluteUrl)) {
      continue;
    }

    seenUrls.add(absoluteUrl);
    const label = rawText ? stripHtml(rawText).trim() : "";
    files.push({
      url: absoluteUrl,
      type: inferWasteType(label, absoluteUrl),
    });
  }

  return files;
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
  const source = `${label} ${url}`.toLowerCase();

  if (source.includes("buit")) {
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

  if (bestRowMonths.size < 2) {
    return [];
  }

  const sectionRow = bestRowIndex > 0 ? data[bestRowIndex - 1] : undefined;
  return [...bestRowMonths.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([columnIndex, month]) => ({
      columnIndex,
      month,
      eventType: sectionRow
        ? inferEventTypeFromSectionRow(sectionRow, columnIndex)
        : null,
    }));
}

function inferEventTypeFromSectionRow(
  sectionRow: CellValue[],
  columnIndex: number,
): string | null {
  for (let cursor = columnIndex; cursor >= 0; cursor -= 1) {
    const value = sectionRow[cursor];
    if (typeof value !== "string") {
      continue;
    }

    const normalized = normalizeText(value).trim();
    if (!normalized) {
      continue;
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
