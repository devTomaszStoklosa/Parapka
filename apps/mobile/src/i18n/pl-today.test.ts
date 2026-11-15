import {
  findPhrases,
  parseForbiddenLists,
} from "../../../../packages/content/src/forbidden";
import { expect, it } from "vitest";

import forbidden from "../../../../content/forbidden-phrases.json";
import { pl } from "./pl";

const flatten = (value: unknown): string[] =>
  typeof value === "string"
    ? [value]
    : Object.values(value as Record<string, unknown>).flatMap(flatten);

it("does not give away the cycle in the texts of the card (FR-CYC-09, R-1)", () => {
  const { revealing } = parseForbiddenLists(forbidden);
  const texts = flatten(pl.todayHint);
  expect(texts.length).toBeGreaterThan(5);
  const found = texts.flatMap((text) => findPhrases(text, [...revealing]));
  expect(found).toEqual([]);
});
