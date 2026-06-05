import { normalizeText } from "./locality.ts";

// Maps a waste-type label to its display icon. Shared so the server (calendar
// link title) and the browser bundle (schedule list) render the same icon.
export function getEventTypeIcon(type: string): string {
  const normalized = normalizeText(type);

  if (normalized.includes("misri")) {
    return "🗑️";
  }

  if (normalized.includes("pakuot")) {
    return "♻️";
  }

  if (normalized.includes("stikl")) {
    return "🍾";
  }

  return "📅";
}
