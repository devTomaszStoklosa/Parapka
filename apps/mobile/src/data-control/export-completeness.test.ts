import { describe, expect, it } from "vitest";

import { EXPORTED_COLLECTIONS, SKIPPED_COLLECTIONS } from "./export-data";

const DEFINITION = /\b(?:export\s+)?const\s+([A-Z][A-Z0-9_]*)\s*=\s*"([^"]+)"/g;
const EXPORTED = /\bexport\s+const\s+([A-Z][A-Z0-9_]*)\s*=\s*"([^"]+)"/g;
const CALL =
  /\b(?:\w+\.)*(?:database|db)\.(?:put|get|list|delete)\(\s*("[a-z][a-z0-9-]*"|[A-Z][A-Z0-9_]*)/g;
const STORE =
  /createRecordStore(?:<[^>(]*>)?\(\s*\w+\s*,\s*("[a-z][a-z0-9-]*"|[A-Z][A-Z0-9_]*)/g;
const LITERAL = /\bcollection:\s*"([a-z][a-z0-9-]*)"/g;

/** The first capture group of every match. */
const captured = (source: string, pattern: RegExp) =>
  [...source.matchAll(pattern)].map(([, first]) => first ?? "");

/** The `NAME` and the value of every `const NAME = "value"` of a source. */
const definitions = (source: string, pattern = DEFINITION) =>
  [...source.matchAll(pattern)].map(
    ([, name, value]) => [name ?? "", value ?? ""] as const,
  );

/**
 * The names of the collections that the sources of the app use. A constant is
 * resolved from its own file first, then from an exported one of any file.
 */
export function collectionsInSource(sources: Record<string, string>): string[] {
  const files = Object.values(sources);
  const exported = new Map(files.flatMap((s) => definitions(s, EXPORTED)));
  const found = new Set<string>();
  for (const source of files) {
    const local = new Map(definitions(source));
    for (const argument of [
      ...captured(source, CALL),
      ...captured(source, STORE),
    ]) {
      const name = argument.startsWith('"')
        ? argument.slice(1, -1)
        : (local.get(argument) ?? exported.get(argument));
      if (name !== undefined) found.add(name);
    }
    for (const name of captured(source, LITERAL)) found.add(name);
  }
  return [...found].sort();
}

const sources = import.meta.glob<string>("../**/*.{ts,tsx}", {
  query: "?raw",
  import: "default",
  eager: true,
});

describe("collectionsInSource", () => {
  it("finds the collections and resolves the constants", () => {
    expect(
      collectionsInSource({
        "a.ts":
          'const COLLECTION = "new-thing";\nawait database.put(COLLECTION, "x", 1);',
        "b.ts": 'export const OTHER = "shared-name";',
        "c.ts": 'import { OTHER } from "./b";\nawait db.list(OTHER);',
        "d.ts": 'await keyStore.get("not-a-collection");',
      }),
    ).toEqual(["new-thing", "shared-name"]);
  });

  it("reads stores, literals and the receivers of a deeper path", () => {
    expect(
      collectionsInSource({
        "a.ts": 'createRecordStore(database, "one-store");',
        "b.ts": 'x = { collection: "two-literal" };',
        "c.ts": 'await this.o.database.get("three-deep", "id");',
      }),
    ).toEqual(["one-store", "three-deep", "two-literal"]);
  });
});

describe("the completeness of the export", () => {
  it("classifies every collection that the code of the app uses", () => {
    const own = Object.fromEntries(
      Object.entries(sources).filter(
        ([path]) => !/\.(?:test|contract)\./.test(path),
      ),
    );
    const found = collectionsInSource(own);
    expect(found).toEqual(
      expect.arrayContaining([
        "activity-log",
        "checkin-keys",
        "checkin-sealed",
        "carrier-changes",
        "handover-requests",
        "pair-closing",
        "sync-outbox",
        "notifications-queue",
      ]),
    );
    expect(found).not.toContain("consent-cleared");
    expect(found).not.toContain("database-key");
    const classified = [...EXPORTED_COLLECTIONS, ...SKIPPED_COLLECTIONS];
    expect(found.filter((name) => !classified.includes(name))).toEqual([]);
  });
});
