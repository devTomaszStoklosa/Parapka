// @vitest-environment jsdom
import { cleanup, fireEvent, render } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";

import { Chip } from "./Chip";
import { MIN_TOUCH_TARGET } from "./theme";

afterEach(cleanup);

it("is plain text without onPress", () => {
  const { getByText, queryByRole } = render(<Chip label="Ala" />);
  expect(queryByRole("button")).toBeNull();
  expect(getByText("Ala").style.fontWeight).toBe("700");
});

it.each(["neutral", "personA", "personB", "dark"] as const)(
  "renders the %s tone",
  (tone) => {
    const { getByText } = render(<Chip label="Ala" tone={tone} />);
    expect(getByText("Ala")).toBeTruthy();
  },
);

it("is a button with a touch target and reports selection", () => {
  const onPress = vi.fn();
  const { getByRole } = render(<Chip label="Ala" selected onPress={onPress} />);
  const button = getByRole("button");
  expect(button.getAttribute("aria-selected")).toBe("true");
  expect(parseFloat(getComputedStyle(button).minHeight)).toBeGreaterThanOrEqual(
    MIN_TOUCH_TARGET,
  );
  fireEvent.click(button);
  expect(onPress).toHaveBeenCalledTimes(1);
});

it("reports not selected by default", () => {
  const { getByRole } = render(<Chip label="Ala" onPress={() => {}} />);
  expect(getByRole("button").getAttribute("aria-selected")).toBe("false");
});
