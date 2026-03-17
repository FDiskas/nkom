import * as XLSX from "xlsx";
import { promises as fs } from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

type CellValue = string | number | null | undefined;
type FileEntry = { url: string; type: string };

type CacheMeta = {
  fetchedAt: number;
  binary: boolean;
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
const CACHE_DIR = path.join(process.cwd(), ".cache", "nkom");

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

      const dates = extractDatesFromRow(row, monthColumns, scheduleYear);
      for (const date of dates) {
        events.push({
          type: file.type,
          date,
          link: createGoogleCalendarLink(file.type, date, keyword),
          sourceFileUrl: file.url,
          keyword,
        });
      }
    }
  }

  return dedupeEvents(events);
}

export async function getLatestXlsxFetchedAt(): Promise<string | null> {
  const files = await getXlsxFilesFromPage(SOURCE_PAGE_URL);
  const fetchedAtValues: number[] = [];

  for (const file of files) {
    const cachePaths = getCachePaths(file.url);

    try {
      const metaRaw = await fs.readFile(cachePaths.metaPath, "utf8");
      const meta = JSON.parse(metaRaw) as CacheMeta;
      if (typeof meta.fetchedAt === "number") {
        fetchedAtValues.push(meta.fetchedAt);
      }
    } catch {
      // Skip missing or malformed metadata and continue.
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
  let entries: Array<{ name: string; size: number }> = [];
  try {
    const dirEntries = await fs.readdir(CACHE_DIR, { withFileTypes: true });
    for (const entry of dirEntries) {
      if (!entry.isFile()) {
        continue;
      }

      const fullPath = path.join(CACHE_DIR, entry.name);
      const stat = await fs.stat(fullPath);
      entries.push({ name: entry.name, size: stat.size });
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
    try {
      const raw = await fs.readFile(
        path.join(CACHE_DIR, metaFile.name),
        "utf8",
      );
      const meta = JSON.parse(raw) as CacheMeta;
      if (typeof meta.fetchedAt === "number") {
        fetchedAtValues.push(meta.fetchedAt);
      }
    } catch {
      // Ignore malformed metadata files and continue diagnostics.
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

function extractCityCandidates(row: CellValue[]): string[] {
  const preferredCell =
    (typeof row[1] === "string" && row[1].trim() ? row[1] : undefined) ??
    row.find(
      (cell): cell is string => typeof cell === "string" && !!cell.trim(),
    );
  if (!preferredCell) {
    return [];
  }

  const sanitized = stripParenthesizedText(preferredCell)
    .replace(/\s+/g, " ")
    .trim();
  if (!sanitized || /\d/.test(sanitized)) {
    return [];
  }

  const blacklist = [
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

  const parts = splitCityParts(sanitized);

  const candidates = new Set<string>();
  for (const part of parts) {
    const cleaned = cleanCityDisplayName(part);
    if (!cleaned) {
      continue;
    }

    const normalized = normalizeText(cleaned);
    if (normalized.length < 3 || normalized.length > 40) {
      continue;
    }

    if (blacklist.some((token) => normalized.includes(token))) {
      continue;
    }

    if (
      !/^[A-Z\u0104\u010C\u0118\u0116\u012E\u0160\u0172\u016A\u017D]/.test(
        cleaned,
      )
    ) {
      continue;
    }

    const wordCount = cleaned.split(/\s+/).filter(Boolean).length;
    if (wordCount > 3) {
      continue;
    }

    candidates.add(cleaned);
  }

  return [...candidates];
}

function stripParenthesizedText(value: string): string {
  let result = value;
  // Repeated replace handles nested parentheses in malformed source text.
  while (/\([^()]*\)/.test(result)) {
    result = result.replace(/\([^()]*\)/g, " ");
  }

  return result;
}

function splitCityParts(value: string): string[] {
  return value
    .split(/[;,/]/g)
    .map((part) => part.trim())
    .filter(Boolean);
}

function cleanCityDisplayName(value: string): string {
  return value
    .replace(/\s+/g, " ")
    .replace(/[\s,.]+$/g, "")
    .replace(/\s+(?:vs\.?|k\.?|km\.?|mstl\.?|m\.)$/i, "")
    .trim();
}

function extractLocalityKeys(value: string): Set<string> {
  const source = stripParenthesizedText(value);
  const parts = splitCityParts(source);
  const keys = new Set<string>();

  for (const part of parts) {
    const cleaned = cleanCityDisplayName(part);
    if (!cleaned) {
      continue;
    }

    const key = toLocalityKey(cleaned);
    if (key) {
      keys.add(key);
    }
  }

  return keys;
}

function toLocalityKey(value: string): string {
  const normalized = normalizeText(value)
    .replace(/["“”„']/g, "")
    .replace(/\b(?:vs|k|km|mstl|m)\b/g, " ")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  if (!normalized) {
    return "";
  }

  const words = normalized
    .split(" ")
    .filter(Boolean)
    .map((word) => stemLocalityWord(word));

  return words.join(" ").trim();
}

function stemLocalityWord(word: string): string {
  const endings = [
    "iai",
    "iu",
    "ių",
    "io",
    "ui",
    "ai",
    "as",
    "is",
    "ys",
    "es",
    "os",
    "us",
    "e",
    "a",
    "i",
    "u",
    "ų",
  ];

  for (const ending of endings) {
    if (word.endsWith(ending) && word.length - ending.length >= 4) {
      return word.slice(0, -ending.length);
    }
  }

  return word;
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

function dedupeEvents(events: CalendarEvent[]): CalendarEvent[] {
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

function getCachePaths(url: string): { dataPath: string; metaPath: string } {
  const key = crypto.createHash("sha256").update(url).digest("hex");
  return {
    dataPath: path.join(CACHE_DIR, `${key}.data`),
    metaPath: path.join(CACHE_DIR, `${key}.meta.json`),
  };
}

async function readFromCache(
  cachePaths: { dataPath: string; metaPath: string },
  binary: boolean,
): Promise<string | Uint8Array | null> {
  try {
    const metaRaw = await fs.readFile(cachePaths.metaPath, "utf8");
    const meta = JSON.parse(metaRaw) as {
      fetchedAt: number;
      binary: boolean;
    };

    if (meta.binary !== binary) {
      return null;
    }

    if (Date.now() - meta.fetchedAt > CACHE_TTL_MS) {
      return null;
    }

    const data = await fs.readFile(cachePaths.dataPath);
    return binary ? new Uint8Array(data) : data.toString("utf8");
  } catch {
    return null;
  }
}

async function writeToCache(
  cachePaths: { dataPath: string; metaPath: string },
  value: string | Uint8Array,
  binary: boolean,
): Promise<void> {
  await fs.mkdir(CACHE_DIR, { recursive: true });
  await fs.writeFile(cachePaths.dataPath, value);
  await fs.writeFile(
    cachePaths.metaPath,
    JSON.stringify({ fetchedAt: Date.now(), binary }),
    "utf8",
  );
}

function stripHtml(value: string): string {
  return value
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/\s+/g, " ");
}

function inferWasteType(label: string, url: string): string {
  const source = `${label} ${url}`.toLowerCase();

  if (source.includes("buit")) {
    return "Mišrios atliekos";
  }

  if (source.includes("pakuoc") || source.includes("stikl")) {
    return "Pakuotės/Stiklas";
  }

  return label || url.split("/").pop() || "Nežinomas tipas";
}

function extractScheduleYear(data: CellValue[][]): number | null {
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

function extractMonthColumns(data: CellValue[][]): Map<number, number> {
  const monthColumns = new Map<number, number>();

  data.forEach((row) => {
    row.forEach((cell, columnIndex) => {
      const month = getMonthNumber(cell);
      if (month !== null) {
        monthColumns.set(columnIndex, month);
      }
    });
  });

  return monthColumns;
}

function getMonthNumber(value: CellValue): number | null {
  if (typeof value !== "string") {
    return null;
  }

  const normalized = normalizeText(value);
  if (normalized.includes("saus")) {
    return 1;
  }
  if (normalized.includes("vasar")) {
    return 2;
  }
  if (normalized.includes("kov")) {
    return 3;
  }
  if (normalized.includes("baland")) {
    return 4;
  }
  if (normalized.includes("geguz")) {
    return 5;
  }
  if (normalized.includes("birzel")) {
    return 6;
  }
  if (normalized.includes("liep")) {
    return 7;
  }
  if (normalized.includes("rugpj")) {
    return 8;
  }
  if (normalized.includes("rugsej")) {
    return 9;
  }
  if (normalized.includes("spal")) {
    return 10;
  }
  if (normalized.includes("lapkr")) {
    return 11;
  }
  if (normalized.includes("gruod")) {
    return 12;
  }

  return null;
}

function normalizeText(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function extractDatesFromRow(
  row: CellValue[],
  monthColumns: Map<number, number>,
  year: number,
): string[] {
  const dates = new Set<string>();

  for (const [columnIndex, month] of monthColumns) {
    const days = parseDays(row[columnIndex]);
    for (const day of days) {
      const date = buildIsoDate(year, month, day);
      if (date) {
        dates.add(date);
      }
    }
  }

  return [...dates].sort();
}

function parseDays(value: CellValue): number[] {
  if (typeof value === "number") {
    if (!Number.isInteger(value) || value < 1 || value > 31) {
      return [];
    }

    return [value];
  }

  if (typeof value !== "string") {
    return [];
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return [];
  }

  const matches = trimmed.match(/\d{1,2}/g);
  if (!matches) {
    return [];
  }

  const days = new Set<number>();
  for (const token of matches) {
    const day = Number(token);
    if (Number.isInteger(day) && day >= 1 && day <= 31) {
      days.add(day);
    }
  }

  return [...days].sort((a, b) => a - b);
}

function buildIsoDate(year: number, month: number, day: number): string | null {
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

function createGoogleCalendarLink(
  type: string,
  date: string,
  keyword: string,
): string {
  const base = "https://www.google.com/calendar/render?action=TEMPLATE";
  const eventName = encodeURIComponent(`Šiukšlių išvežimas: ${type}`);
  const details = encodeURIComponent(
    `NKOM ${type} grafikas vietovei: ${keyword}\nŠaltinis: ${SOURCE_PAGE_URL}`,
  );
  const dateStr = date.replace(/-/g, "");
  const nextDay = new Date(new Date(date).getTime() + 86400000)
    .toISOString()
    .slice(0, 10)
    .replace(/-/g, "");

  return `${base}&text=${eventName}&dates=${dateStr}/${nextDay}&details=${details}`;
}
