// @vitest-environment jsdom
import { cleanup, render } from "@testing-library/react";
import { Pressable } from "react-native";
import { afterEach, expect, it } from "vitest";

import { Icon, type IconName } from "./Icon";

afterEach(cleanup);

const names = [
  "today",
  "cycle",
  "planner",
  "head",
  "settings",
  "check",
  "plus",
  "lock",
  "pause",
  "heart",
  "sparkle",
  "arrowRight",
  "chevronLeft",
  "chevronRight",
  "clock",
  "repeat",
  "handOff",
  "info",
  "shield",
  "link",
  "copy",
  "close",
  "swap",
  "more",
  "archive",
  "pen",
  "trendUp",
  "trendDown",
] satisfies IconName[];

const outlineNames = names.filter((name) => name !== "more");

it.each(outlineNames)(
  "renders %s as an outline svg of the given size and colour",
  (name) => {
    const { container } = render(
      <Icon name={name} size={30} color="#112233" />,
    );
    const svg = container.querySelector("svg");
    expect(svg?.getAttribute("width")).toBe("30");
    expect(svg?.getAttribute("height")).toBe("30");
    expect(svg?.getAttribute("stroke")).toBe("#112233");
    expect(svg?.getAttribute("fill")).toBe("none");
    expect(svg?.querySelector("path, circle, rect")).not.toBeNull();
  },
);

it("renders more as a filled svg of the given size and colour", () => {
  const { container } = render(<Icon name="more" size={30} color="#112233" />);
  const svg = container.querySelector("svg");
  expect(svg?.getAttribute("width")).toBe("30");
  expect(svg?.getAttribute("height")).toBe("30");
  expect(svg?.getAttribute("fill")).toBe("#112233");
  expect(svg?.querySelector("circle")).not.toBeNull();
});

it("defaults to size 22, the text colour and stroke width 1.9", () => {
  const { container } = render(<Icon name="check" />);
  const svg = container.querySelector("svg");
  expect(svg?.getAttribute("width")).toBe("22");
  expect(svg?.getAttribute("stroke")).toBe("#1F1A2E");
  expect(svg?.getAttribute("stroke-width")).toBe("1.9");
});

it("is hidden from screen readers and has no role or label", () => {
  const { container } = render(<Icon name="check" />);
  const svg = container.querySelector("svg");
  expect(svg?.getAttribute("aria-hidden")).toBe("true");
  expect(svg?.hasAttribute("role")).toBe(false);
  expect(svg?.hasAttribute("aria-label")).toBe(false);
});

it("takes no pointer events, so a press lands on the control around it", () => {
  const { container } = render(<Icon name="check" />);
  const svg = container.querySelector("svg") as SVGElement;
  expect(getComputedStyle(svg).pointerEvents).toBe("none");
});

it("leaves the accessible name of a button to its label", () => {
  const { getByRole, queryAllByRole } = render(
    <Pressable accessibilityRole="button" accessibilityLabel="Dodaj">
      <Icon name="plus" />
    </Pressable>,
  );
  expect(getByRole("button", { name: "Dodaj" })).toBeTruthy();
  expect(queryAllByRole("img")).toEqual([]);
});

it("rejects an unknown icon name at compile time", () => {
  // @ts-expect-error "nope" is not an IconName
  const element = <Icon name="nope" />;
  expect(element).toBeTruthy();
});
