/// <reference types="vite/client" />
import { expect, it } from "vitest";

import { colors, contrastRatio } from "./theme";

it("computes known WCAG ratios", () => {
  expect(contrastRatio("#000000", "#FFFFFF")).toBeCloseTo(21, 5);
  expect(contrastRatio("#FFFFFF", "#FFFFFF")).toBeCloseTo(1, 5);
});

it.each([
  ["text", "background"],
  ["text", "surface"],
  ["textMuted", "background"],
  ["textMuted", "surface"],
  ["accent", "background"],
  ["accent", "surface"],
  ["onAccent", "accent"],
] as const)("%s on %s has contrast of at least 4.5:1", (fg, bg) => {
  expect(contrastRatio(colors[fg], colors[bg])).toBeGreaterThanOrEqual(4.5);
});

const sources = import.meta.glob<string>("../**/*.{ts,tsx}", {
  query: "?raw",
  import: "default",
  eager: true,
});

it("scans the source files", () => {
  expect(Object.keys(sources).length).toBeGreaterThan(5);
});

it("never disables font scaling", () => {
  for (const [path, code] of Object.entries(sources)) {
    if (path.endsWith(".test.ts") || path.endsWith(".test.tsx")) continue;
    expect(code, path).not.toMatch(/allowFontScaling=\{\s*false\s*\}/);
  }
});

it("does not import expo-* packages", () => {
  for (const [path, code] of Object.entries(sources)) {
    if (path.endsWith(".test.ts") || path.endsWith(".test.tsx")) continue;
    expect(code, path).not.toMatch(/from\s+["']expo(-|["'/])/);
  }
});
