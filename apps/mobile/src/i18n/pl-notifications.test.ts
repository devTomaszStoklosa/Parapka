import {
  findPhrases,
  parseForbiddenLists,
} from "../../../../packages/content/src/forbidden";
import { expect, it } from "vitest";

import forbidden from "../../../../content/forbidden-phrases.json";
import { plNotifications } from "./pl-notifications";

it("does not give away the cycle in the wellbeing reminder (FR-NOT-05, R-1)", () => {
  const { revealing } = parseForbiddenLists(forbidden);
  const texts = Object.values(plNotifications.wellbeing);
  const found = texts.flatMap((text) => findPhrases(text, [...revealing]));
  expect(found).toEqual([]);
});
