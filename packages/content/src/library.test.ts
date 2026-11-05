/// <reference types="vite/client" />
import { describe, expect, it } from "vitest";
import { KNOWN_FILES, formatError, loadLibrary } from "./library.js";

const files = import.meta.glob<unknown>(
  ["../../../content/**/*.json", "!../../../content/forbidden-phrases.json"],
  { eager: true, import: "default" },
);

describe("content/ directory", () => {
  it("contains every known content file", () => {
    const names = Object.keys(files).map((path) => path.split("/").pop());
    expect(names.sort()).toEqual([...KNOWN_FILES].sort());
  });

  it("is valid", () => {
    const result = loadLibrary(files);
    expect(result.ok ? [] : result.errors.map(formatError)).toEqual([]);
  });
});
