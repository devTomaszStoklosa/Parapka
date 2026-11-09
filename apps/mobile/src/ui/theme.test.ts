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
