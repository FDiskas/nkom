// Lithuanian locality name normalization shared by the server (XLSX keyword
// matching, city extraction) and the browser bundle (search box / URL matching),
// so both sides agree on which names are considered the same place.

export function normalizeText(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");
}

export function stripParenthesizedText(value: string): string {
  let result = value;
  // Repeated replace handles nested parentheses in malformed source text.
  while (/\([^()]*\)/.test(result)) {
    result = result.replace(/\([^()]*\)/g, " ");
  }

  return result;
}

export function splitCityParts(value: string): string[] {
  return value
    .split(/[;,/]/g)
    .map((part) => part.trim())
    .filter(Boolean);
}

export function cleanCityDisplayName(value: string): string {
  return value
    .replace(/\s+/g, " ")
    .replace(/[\s,.]+$/g, "")
    .replace(/\s+(?:vs\.?|k\.?|km\.?|mstl\.?|m\.)$/i, "")
    .trim();
}

export function normalizeLocality(value: string): string {
  return normalizeText(value)
    .replace(/["“”„']/g, "")
    .replace(/\b(?:vs|k|km|mstl|m)\b/g, " ")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function toLocalityKey(value: string): string {
  const normalized = normalizeLocality(value);
  if (!normalized) {
    return "";
  }

  return normalized
    .split(" ")
    .filter(Boolean)
    .map((word) => stemLocalityWord(word))
    .join(" ")
    .trim();
}

export function extractLocalityKeys(value: string): Set<string> {
  const parts = splitCityParts(stripParenthesizedText(value));
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
