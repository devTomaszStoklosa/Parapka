import {
  findPhrases,
  parseForbiddenLists,
} from "../../../../packages/content/src/forbidden";
import { expect, it } from "vitest";

import forbidden from "../../../../content/forbidden-phrases.json";
import { pl } from "./pl";

it("does not give away the cycle in the texts of the card (FR-CYC-09, R-1)", () => {
  const { revealing } = parseForbiddenLists(forbidden);
  const texts = Object.values(pl.todayHint);
  expect(texts.length).toBeGreaterThan(5);
  const found = texts.flatMap((text) => findPhrases(text, [...revealing]));
  expect(found).toEqual([]);
});
