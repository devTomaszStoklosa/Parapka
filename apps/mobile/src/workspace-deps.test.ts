import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { expect, it } from "vitest";

const IMPORT_PATTERN = /from\s+["'](@parapka\/[\w-]+)(?:\/[^"']*)?["']/g;

function usedWorkspaceDeps(sources: Record<string, string>): string[] {
  const used = new Set<string>();
  for (const source of Object.values(sources)) {
    for (const [, name] of source.matchAll(IMPORT_PATTERN)) {
      if (name) used.add(name);
    }
  }
  return [...used].sort();
}

function missingWorkspaceDeps(
  sources: Record<string, string>,
  declared: string[],
): string[] {
  return usedWorkspaceDeps(sources).filter((name) => !declared.includes(name));
}

function readSources(
  dir: string,
  into: Record<string, string> = {},
): Record<string, string> {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) readSources(path, into);
    else if (/\.tsx?$/.test(entry.name) && !/\.test\./.test(entry.name)) {
      into[path] = readFileSync(path, "utf8");
    }
  }
  return into;
}

it("reports workspace imports missing from the declared dependencies", () => {
  const sources = {
    "a.ts": 'import { x } from "@parapka/sync";',
    "b.ts": 'import type { Y } from "@parapka/domain";',
    "c.ts": 'import z from "react";',
  };
  expect(missingWorkspaceDeps(sources, ["@parapka/domain"])).toEqual([
    "@parapka/sync",
  ]);
});

it("declares every workspace package the app code imports", () => {
  const sources = readSources(__dirname);
  const manifest = JSON.parse(
    readFileSync(join(__dirname, "..", "package.json"), "utf8"),
  ) as {
    dependencies: Record<string, string>;
  };
  expect(usedWorkspaceDeps(sources)).toEqual(
    expect.arrayContaining([
      "@parapka/sync",
      "@parapka/protocol",
      "@parapka/crypto",
    ]),
  );
  expect(
    missingWorkspaceDeps(sources, Object.keys(manifest.dependencies)),
  ).toEqual([]);
});
