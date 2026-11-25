// @vitest-environment jsdom
import { cleanup, fireEvent, render } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";

import { LabelledSwitch } from "./LabelledSwitch";
import { colors, contrastRatio, MIN_TOUCH_TARGET } from "./theme";

afterEach(cleanup);

function hex(color: string): string {
  const n = parseInt(color.slice(1), 16);
  return `rgb(${String(n >> 16)}, ${String((n >> 8) & 255)}, ${String(n & 255)})`;
}

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

it("draws a 52x32 track and a white thumb in both states", () => {
  const off = render(
    <LabelledSwitch label="Notify" value={false} onChange={() => {}} />,
  );
  let track = getComputedStyle(off.getByTestId("switch-track"));
  expect(track.width).toBe("52px");
  expect(track.height).toBe("32px");
  expect(track.backgroundColor).toBe(hex(colors.borderSubtle));
  expect(track.borderTopWidth).not.toBe("0px");
  let thumb = getComputedStyle(off.getByTestId("switch-thumb"));
  expect(thumb.backgroundColor).toBe(hex(colors.surface));
  expect(thumb.left).toBe("3px");
  off.unmount();
  const on = render(
    <LabelledSwitch label="Notify" value onChange={() => {}} />,
  );
  track = getComputedStyle(on.getByTestId("switch-track"));
  expect(track.backgroundColor).toBe(hex(colors.accent));
  thumb = getComputedStyle(on.getByTestId("switch-thumb"));
  expect(thumb.backgroundColor).toBe(hex(colors.surface));
  expect(thumb.left).toBe("23px");
});

it("shows a focus indicator only while the switch is focused", () => {
  const { getByRole, queryByTestId } = render(
    <LabelledSwitch label="Notify" value={false} onChange={() => {}} />,
  );
  expect(queryByTestId("switch-focus")).toBeNull();
  fireEvent.focus(getByRole("switch", { name: "Notify" }));
  expect(queryByTestId("switch-focus")).not.toBeNull();
  fireEvent.blur(getByRole("switch", { name: "Notify" }));
  expect(queryByTestId("switch-focus")).toBeNull();
});
