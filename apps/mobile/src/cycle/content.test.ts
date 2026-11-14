import { expect, it } from "vitest";

import { loadContent } from "./content";

it("loads the library of the content directory", () => {
  const library = loadContent();
  expect(library?.hintTemplates.contentVersion).toBeGreaterThan(0);
  expect(library?.hintTemplates.entries.length).toBeGreaterThan(0);
});

it("gives null instead of throwing when the files are invalid", () => {
  expect(loadContent({})).toBeNull();
  expect(loadContent({ "phases.json": 1 })).toBeNull();
});
