import type { GrammaticalForm } from "@parapka/domain";

import { pl } from "./pl";

export type FormEntry = Record<GrammaticalForm, string>;

/** Structure of a dictionary: every leaf is a string or an entry with the three forms. */
export type Widen<T> = T extends string
  ? string
  : T extends FormEntry
    ? FormEntry
    : { [K in keyof T]: Widen<T[K]> };

export type Dictionary = Widen<typeof pl>;

type Keys<T, P extends string = ""> = {
  [K in keyof T & string]: T[K] extends string | FormEntry
    ? `${P}${K}`
    : Keys<T[K], `${P}${K}.`>;
}[keyof T & string];

export type TranslationKey = Keys<typeof pl>;

export type Params = Record<string, string | number>;

// Adding a language means adding a dictionary of the same structure here.
const dictionary: Dictionary = pl;

function lookup(key: string): string | FormEntry {
  let node: unknown = dictionary;
  for (const part of key.split(".")) {
    node = (node as Record<string, unknown>)[part];
  }
  return node as string | FormEntry;
}

export function t(
  key: TranslationKey,
  params: Params = {},
  form: GrammaticalForm = "neutral",
): string {
  const entry = lookup(key);
  const text = typeof entry === "string" ? entry : entry[form];
  return text.replace(/\{(\w+)\}/g, (match, name: string) =>
    name in params ? String(params[name]) : match,
  );
}
