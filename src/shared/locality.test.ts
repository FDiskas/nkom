import { describe, expect, test } from "bun:test";
import {
  cleanCityDisplayName,
  extractLocalityKeys,
  normalizeLocality,
  normalizeText,
  splitCityParts,
  stripParenthesizedText,
  toLocalityKey,
} from "./locality.ts";

describe("normalizeText", () => {
  test("lowercases and strips Lithuanian diacritics", () => {
    expect(normalizeText("Šiauliai")).toBe("siauliai");
    expect(normalizeText("ĄČĘĖĮŠŲŪŽ")).toBe("aceeisuuz");
  });

  test("leaves punctuation and spacing intact", () => {
    expect(normalizeText("Kaunas (centras)")).toBe("kaunas (centras)");
  });
});

describe("stripParenthesizedText", () => {
  test("removes parenthesized segments", () => {
    expect(stripParenthesizedText("Kaunas (centras)").trim()).toBe("Kaunas");
  });

  test("removes nested parentheses", () => {
    expect(stripParenthesizedText("A (b (c)) D").replace(/\s+/g, " ").trim()).toBe(
      "A D",
    );
  });
});

describe("splitCityParts", () => {
  test("splits on ; , and / and trims", () => {
    expect(splitCityParts("Kaunas; Vievis, Trakai/ Elektrėnai")).toEqual([
      "Kaunas",
      "Vievis",
      "Trakai",
      "Elektrėnai",
    ]);
  });

  test("drops empty fragments", () => {
    expect(splitCityParts("Kaunas;; ,")).toEqual(["Kaunas"]);
  });
});

describe("cleanCityDisplayName", () => {
  test("strips trailing locality abbreviations", () => {
    expect(cleanCityDisplayName("Vievis k.")).toBe("Vievis");
    expect(cleanCityDisplayName("Trakai vs.")).toBe("Trakai");
  });

  test("collapses whitespace and trailing punctuation", () => {
    expect(cleanCityDisplayName("Didžioji   Riešė ,")).toBe("Didžioji Riešė");
  });
});

describe("normalizeLocality", () => {
  test("strips diacritics, quotes and standalone abbreviations", () => {
    expect(normalizeLocality("Didžioji Riešė k.")).toBe("didzioji riese");
    expect(normalizeLocality("„Kalviškės“")).toBe("kalviskes");
  });
});

describe("toLocalityKey", () => {
  test("stems Lithuanian declension endings to a shared key", () => {
    expect(toLocalityKey("Kalviškės")).toBe("kalvisk");
    // Different grammatical cases of the same locality collapse to one key.
    expect(toLocalityKey("Kalviškių")).toBe(toLocalityKey("Kalviškės"));
  });

  test("returns empty string for non-locality input", () => {
    expect(toLocalityKey("   ")).toBe("");
  });
});

describe("extractLocalityKeys", () => {
  test("produces a stemmed key per locality fragment", () => {
    const keys = extractLocalityKeys("Kalviškės; Vievis (sen.)");
    expect(keys.has(toLocalityKey("Kalviškės"))).toBe(true);
    expect(keys.has(toLocalityKey("Vievis"))).toBe(true);
  });
});
