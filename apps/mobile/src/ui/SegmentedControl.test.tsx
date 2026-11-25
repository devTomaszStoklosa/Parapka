// @vitest-environment jsdom
import { cleanup, fireEvent, render } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";

import { SegmentedControl } from "./SegmentedControl";
import { MIN_TOUCH_TARGET } from "./theme";

afterEach(cleanup);

const options = [
  { value: "a", label: "Alpha" },
  { value: "b", label: "Beta" },
] as const;

it("reports the chosen option as selected, with touch targets", () => {
  const { getByRole } = render(
    <SegmentedControl options={options} value="a" onChange={() => {}} />,
  );
  const alpha = getByRole("button", { name: "Alpha" });
  expect(alpha.getAttribute("aria-selected")).toBe("true");
  expect(
    getByRole("button", { name: "Beta" }).getAttribute("aria-selected"),
  ).toBe("false");
  expect(parseFloat(getComputedStyle(alpha).minHeight)).toBeGreaterThanOrEqual(
    MIN_TOUCH_TARGET,
  );
});

it("changes only to another value", () => {
  const onChange = vi.fn();
  const { getByRole } = render(
    <SegmentedControl options={options} value="a" onChange={onChange} />,
  );
  fireEvent.click(getByRole("button", { name: "Alpha" }));
  expect(onChange).not.toHaveBeenCalled();
  fireEvent.click(getByRole("button", { name: "Beta" }));
  expect(onChange).toHaveBeenCalledExactlyOnceWith("b");
});
