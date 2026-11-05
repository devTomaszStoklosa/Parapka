import {
  HINT_TEMPLATES_FILE,
  PHASES_FILE,
  type ContentLibrary,
} from "./library.js";
import { GRAMMATICAL_FORMS, type FormTexts } from "./types.js";

export const MAX_HINT_LENGTH = 120;

export interface ForbiddenLists {
  /** Word stems banned in every library text. */
  medical: string[];
  /** Word stems banned in hint templates; phase descriptions must name phases. */
  revealing: string[];
  /** Word stems banned in hint templates. */
  sexual: string[];
  /** Messages removed from a text before the medical list is checked. */
  allowedMessages: string[];
}

export type ViolationKind =
  "medical" | "revealing" | "sexual" | "length" | "missing-form";

export interface Violation {
  file: string;
  /** The `id` of a hint template or the `phase` of a phase description. */
  entry: string;
  form: string;
  kind: ViolationKind;
  /** The phrase found, or what is wrong with the text. */
  found: string;
}

const LIST_KEYS = [
  "medical",
  "revealing",
  "sexual",
  "allowedMessages",
] as const;

export function parseForbiddenLists(data: unknown): ForbiddenLists {
  const raw: Record<string, unknown> =
    typeof data === "object" && data !== null ? { ...data } : {};
  const lists: Partial<ForbiddenLists> = {};
  for (const key of LIST_KEYS) {
    const list = raw[key];
    if (!Array.isArray(list) || !list.every((item) => typeof item === "string"))
      throw new Error(`"${key}" must be a list of strings`);
    lists[key] = list;
  }
  return lists as ForbiddenLists;
}

const escapeRegExp = (text: string): string =>
  text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** One word of a phrase: stems separated by "|" are alternatives. */
const wordPattern = (word: string): RegExp =>
  new RegExp(
    `(?<!\\p{L})(?:${word.toLowerCase().split("|").map(escapeRegExp).join("|")})`,
    "u",
  );

/**
 * Finds the entries of `stems` that match `text`, ignoring case. Every
 * space-separated word of an entry is a stem that must start a word in the
 * text, in any order, so inflections ("okresie", "dniach płodnych", "płodne
 * dni") are caught but accidental hits inside other words are not.
 */
export function findPhrases(text: string, stems: readonly string[]): string[] {
  const lower = text.toLowerCase();
  return stems.filter((stem) =>
    stem
      .split(/\s+/)
      .filter((word) => word !== "")
      .every((word) => wordPattern(word).test(lower)),
  );
}

export function removeAllowedMessages(
  text: string,
  allowed: readonly string[],
): string {
  let result = text.toLowerCase();
  for (const message of allowed)
    result = result.split(message.toLowerCase()).join(" ");
  return result;
}

interface Source {
  file: string;
  entry: string;
  text: FormTexts;
}

function checkSource(
  source: Source,
  lists: ForbiddenLists,
  isHint: boolean,
): Violation[] {
  const violations: Violation[] = [];
  for (const form of GRAMMATICAL_FORMS) {
    const add = (kind: ViolationKind, found: string) =>
      violations.push({
        file: source.file,
        entry: source.entry,
        form,
        kind,
        found,
      });
    const text: unknown = source.text[form];
    if (typeof text !== "string") {
      add("missing-form", "form is missing");
      continue;
    }
    for (const phrase of findPhrases(
      removeAllowedMessages(text, lists.allowedMessages),
      lists.medical,
    ))
      add("medical", phrase);
    if (!isHint) continue;
    if (text.length > MAX_HINT_LENGTH)
      add(
        "length",
        `${String(text.length)} characters, limit ${String(MAX_HINT_LENGTH)}`,
      );
    for (const phrase of findPhrases(text, lists.revealing))
      add("revealing", phrase);
    for (const phrase of findPhrases(text, lists.sexual)) add("sexual", phrase);
  }
  return violations;
}

/** Checks the whole library against the forbidden phrases, length and forms. */
export function checkLibrary(
  library: ContentLibrary,
  lists: ForbiddenLists,
): Violation[] {
  return [
    ...library.phases.entries.flatMap((entry) =>
      checkSource(
        { file: PHASES_FILE, entry: entry.phase, text: entry.text },
        lists,
        false,
      ),
    ),
    ...library.hintTemplates.entries.flatMap((entry) =>
      checkSource(
        { file: HINT_TEMPLATES_FILE, entry: entry.id, text: entry.text },
        lists,
        true,
      ),
    ),
  ];
}

export function formatViolation(violation: Violation): string {
  return `${violation.file}: ${violation.entry} (${violation.form}): ${violation.kind}: ${violation.found}`;
}
