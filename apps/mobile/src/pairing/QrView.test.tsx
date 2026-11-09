// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";
import { QrView, runsOfRow } from "./QrView";

afterEach(cleanup);

it("merges neighbouring modules of one colour", () => {
  expect(runsOfRow([true, true, false, true])).toEqual([
    { dark: true, length: 2 },
    { dark: false, length: 1 },
    { dark: true, length: 1 },
  ]);
  expect(runsOfRow([])).toEqual([]);
});

it("draws the matrix with a quiet zone and a label", () => {
  render(
    <QrView
      matrix={[
        [true, false],
        [false, true],
      ]}
      accessibilityLabel="qr"
    />,
  );
  const image = screen.getByLabelText("qr");
  // 2 rows plus 4 rows of quiet zone on each side.
  expect(image.children).toHaveLength(10);
});
