// @vitest-environment jsdom
import { cleanup, fireEvent, render } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";

import { LabelledSwitch } from "./LabelledSwitch";
import { colors, contrastRatio, MIN_TOUCH_TARGET } from "./theme";

afterEach(cleanup);

it("keeps the whole row a touch target and toggles from the label", () => {
  const onChange = vi.fn();
  const { getByRole, getByText } = render(
    <LabelledSwitch
      label="Notify"
      hint="Daily"
      value={false}
      onChange={onChange}
    />,
  );
  expect(getByRole("switch", { name: "Notify" })).toBeTruthy();
  const row = getByText("Notify").parentElement?.parentElement as HTMLElement;
  expect(parseFloat(getComputedStyle(row).minHeight)).toBeGreaterThanOrEqual(
    MIN_TOUCH_TARGET,
  );
  const label = getByText("Notify").parentElement as HTMLElement;
  expect(parseFloat(getComputedStyle(label).minHeight)).toBeGreaterThanOrEqual(
    MIN_TOUCH_TARGET,
  );
  fireEvent.click(getByText("Notify"));
  expect(onChange).toHaveBeenCalledExactlyOnceWith(true);
  expect(getByText("Daily")).toBeTruthy();
});

it("renders an enabled switch without the hint", () => {
  const { getByRole } = render(
    <LabelledSwitch label="Notify" value onChange={() => {}} />,
  );
  expect(getByRole("switch", { name: "Notify" })).toBeTruthy();
});

it("keeps the track visible against the surfaces", () => {
  expect(contrastRatio(colors.border, colors.surface)).toBeGreaterThanOrEqual(
    3,
  );
  expect(
    contrastRatio(colors.border, colors.background),
  ).toBeGreaterThanOrEqual(3);
  expect(contrastRatio(colors.accent, colors.surface)).toBeGreaterThanOrEqual(
    3,
  );
});
