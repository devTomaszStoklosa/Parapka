/// <reference types="vite/client" />
import { describe, expect, it } from "vitest";
import {
  checkLibrary,
  findPhrases,
  formatViolation,
  parseForbiddenLists,
  removeAllowedMessages,
  type ForbiddenLists,
} from "./forbidden.js";
import { loadLibrary, type ContentLibrary } from "./library.js";

const lists: ForbiddenLists = {
  medical: ["dni płodn", "antykoncep"],
  revealing: ["okres", "faz"],
  sexual: ["seks"],
  allowedMessages: ["to nie jest metoda antykoncepcji ani narzędzie medyczne"],
};

const forms = (text: string) => ({
  feminine: text,
  masculine: text,
  neutral: text,
});

type HintText = ContentLibrary["hintTemplates"]["entries"][0]["text"];

function library(hint: unknown, phase = "Spokojny dzień."): ContentLibrary {
  return {
    phases: {
      contentVersion: 1,
      entries: [{ phase: "luteal", text: forms(phase), review: "unreviewed" }],
    },
    hintTemplates: {
      contentVersion: 1,
      entries: [
        {
          id: "h1",
          category: "relief",
          text: hint as HintText,
          review: "unreviewed",
        },
      ],
    },
    engineRules: { contentVersion: 1, entries: [] },
  };
}

describe("findPhrases", () => {
  it("ignores case and matches inflections by stem", () => {
    for (const text of ["Okres", "w okresie", "OKRESOWY", "okres"])
      expect(findPhrases(text, ["okres"])).toEqual(["okres"]);
  });

  it("does not match inside another word or without a match", () => {
    expect(findPhrases("pokresować", ["okres"])).toEqual([]);
    expect(findPhrases("Zrób kolację.", ["okres", "faz"])).toEqual([]);
  });

  it("matches multi-word stems", () => {
    expect(findPhrases("Dni płodne", ["dni płodn"])).toEqual(["dni płodn"]);
  });

  it("matches inflected and reordered multi-word stems", () => {
    const phrase = ["płodn dn|dzie"];
    for (const text of ["dniach płodnych", "płodne dni", "w płodnym dniu"])
      expect(findPhrases(text, phrase)).toEqual(phrase);
    expect(findPhrases("bezpiecznym dniu", ["bezpieczn dn|dzie"])).toEqual([
      "bezpieczn dn|dzie",
    ]);
  });

  it("requires every word of a multi-word stem", () => {
    expect(findPhrases("płodne rośliny", ["płodn dn|dzie"])).toEqual([]);
    expect(findPhrases("dni wolne", ["płodn dn|dzie"])).toEqual([]);
  });
});

describe("removeAllowedMessages", () => {
  it("removes the allowed message regardless of case", () => {
    const text = "To nie jest metoda antykoncepcji ani narzędzie medyczne.";
    const cleaned = removeAllowedMessages(text, lists.allowedMessages);
    expect(findPhrases(cleaned, lists.medical)).toEqual([]);
  });

  it("keeps other text", () => {
    expect(removeAllowedMessages("Antykoncepcja", lists.allowedMessages)).toBe(
      "antykoncepcja",
    );
  });
});

describe("checkLibrary", () => {
  it("accepts clean content", () => {
    expect(checkLibrary(library(forms("Zrób herbatę.")), lists)).toEqual([]);
  });

  it("finds medical phrases in hints and in phase descriptions", () => {
    const found = checkLibrary(
      library(forms("Antykoncepcja"), "Dni płodne"),
      lists,
    );
    const pairs = found.map((v) => [v.file, v.kind]);
    expect(pairs).toContainEqual(["phases.json", "medical"]);
    expect(pairs).toContainEqual(["hint-templates.json", "medical"]);
  });

  it("allows the disclaimer message", () => {
    const text = "To nie jest metoda antykoncepcji ani narzędzie medyczne.";
    expect(checkLibrary(library(forms(text), text), lists)).toEqual([]);
  });

  it("flags a medical phrase next to the disclaimer", () => {
    const text =
      "To nie jest metoda antykoncepcji ani narzędzie medyczne. Antykoncepcja.";
    expect(checkLibrary(library(forms(text)), lists)).toHaveLength(3);
  });

  it("flags revealing and sexual phrases only in hints", () => {
    const found = checkLibrary(
      library(forms("W okresie, seks."), "Faza i okres."),
      lists,
    );
    expect(found.filter((v) => v.file === "phases.json")).toEqual([]);
    expect(found.map((v) => v.kind)).toContain("revealing");
    expect(found.map((v) => v.kind)).toContain("sexual");
  });

  it("limits the length of every form to 120 characters", () => {
    expect(checkLibrary(library(forms("a".repeat(120))), lists)).toEqual([]);
    const found = checkLibrary(
      library({ ...forms("ok"), neutral: "a".repeat(121) }),
      lists,
    );
    expect(found).toEqual([
      {
        file: "hint-templates.json",
        entry: "h1",
        form: "neutral",
        kind: "length",
        found: "121 characters, limit 120",
      },
    ]);
  });

  it("flags a missing form", () => {
    const found = checkLibrary(
      library({ feminine: "a", masculine: "b" }),
      lists,
    );
    expect(found).toEqual([
      {
        file: "hint-templates.json",
        entry: "h1",
        form: "neutral",
        kind: "missing-form",
        found: "form is missing",
      },
    ]);
  });
});

describe("formatViolation", () => {
  it("names file, entry, form and phrase", () => {
    const [violation] = checkLibrary(
      library({ ...forms("ok"), masculine: "Okres" }),
      lists,
    );
    expect(formatViolation(violation as NonNullable<typeof violation>)).toBe(
      "hint-templates.json: h1 (masculine): revealing: okres",
    );
  });
});

describe("parseForbiddenLists", () => {
  it("accepts well-formed lists", () => {
    expect(parseForbiddenLists(lists)).toEqual(lists);
  });

  it("rejects missing or malformed lists", () => {
    expect(() => parseForbiddenLists(undefined)).toThrow('"medical"');
    expect(() => parseForbiddenLists({ ...lists, sexual: [1] })).toThrow(
      '"sexual"',
    );
  });
});

const files = import.meta.glob<unknown>(
  ["../../../content/**/*.json", "!../../../content/forbidden-phrases.json"],
  { eager: true, import: "default" },
);
const phrases = import.meta.glob<unknown>(
  "../../../content/forbidden-phrases.json",
  { eager: true, import: "default" },
);

describe("content library", () => {
  it("has no forbidden phrases and respects length and forms", () => {
    const loaded = loadLibrary(files);
    if (!loaded.ok) throw new Error("content library is invalid");
    const data = Object.values(phrases)[0];
    const violations = checkLibrary(loaded.library, parseForbiddenLists(data));
    expect(violations.map(formatViolation)).toEqual([]);
  });
});
