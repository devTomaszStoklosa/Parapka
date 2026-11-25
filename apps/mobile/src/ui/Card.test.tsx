// @vitest-environment jsdom
import { cleanup, render } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";

import { Card } from "./Card";
import { colors } from "./theme";

afterEach(cleanup);

function background(tone?: Parameters<typeof Card>[0]["tone"]) {
  const { getByText } = render(<Card tone={tone}>content</Card>);
  return getByText("content").style.backgroundColor;
}

function rgb(hex: string) {
  const n = parseInt(hex.slice(1), 16);
  return [
    "rgb(",
    [(n >> 16) & 255, (n >> 8) & 255, n & 255].join(", "),
    ")",
  ].join("");
}

it("uses the surface tone by default", () => {
  expect(background()).toBe(rgb(colors.surface));
});

it.each([
  ["personATint", colors.personATint],
  ["personBTint", colors.personBTint],
  ["dark", colors.text],
] as const)("paints the %s tone", (tone, color) => {
  cleanup();
  expect(background(tone)).toBe(rgb(color));
});
