import {
  findPhrases,
  parseForbiddenLists,
  removeAllowedMessages,
} from "../../../../packages/content/src/forbidden";
import { expect, it } from "vitest";

import forbidden from "../../../../content/forbidden-phrases.json";
import { pl } from "./pl";

const lists = parseForbiddenLists(forbidden);

/** Every text of the dictionary with its path; the forms of an entry are leaves. */
function texts(node: unknown, path: string): [string, string][] {
  if (typeof node === "string") return [[path, node]];
  return Object.entries(node as Record<string, unknown>).flatMap(
    ([key, child]) => texts(child, path + "." + key),
  );
}

const all = texts(pl, "pl");

it("walks over the whole dictionary", () => {
  expect(all.length).toBeGreaterThan(300);
  expect(all.map(([path]) => path)).toContain("pl.cycle.noForecast");
});

it("has no medical phrases outside the allowed message (FR-CYC-03)", () => {
  const found = all.flatMap(([path, text]) =>
    findPhrases(removeAllowedMessages(text, lists.allowedMessages), [
      ...lists.medical,
    ]).map((phrase) => path + ": " + phrase),
  );
  expect(found).toEqual([]);
});

it("mentions contraception only in the message of FR-CYC-15", () => {
  const paths = all
    .filter(([, text]) => text.toLowerCase().includes("antykoncepcj"))
    .map(([path]) => path);
  expect(paths).toEqual(["pl.onboarding.disclaimer.text"]);
});
