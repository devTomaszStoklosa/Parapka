// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";

import { pl } from "../i18n/pl";
import { colors, contrastRatio, fontSizes } from "../ui/theme";
import type { TabId } from "./stack-state";
import { TAB_BAR_SIDE, TabBar, tabBarMinWidth } from "./TabBar";

afterEach(cleanup);

const all: TabId[] = ["today", "cycle", "planner", "head", "settings"];

function renderBar(active: TabId, onSelect: (tab: TabId) => void = vi.fn()) {
  render(<TabBar tabs={all} active={active} onSelect={onSelect} />);
}

it("names every tab, shows the label and selection of the active one only", () => {
  renderBar("planner");
  const tabs = screen.getAllByRole("tab");
  expect(tabs.map((tab) => tab.getAttribute("aria-label"))).toEqual(
    Object.values(pl.tabs),
  );
  expect(tabs.map((tab) => tab.getAttribute("aria-selected"))).toEqual([
    "false",
    "false",
    "true",
    "false",
    "false",
  ]);
  expect(screen.getByText(pl.tabs.planner)).toBeTruthy();
  expect(screen.queryByText(pl.tabs.today)).toBeNull();
  expect(screen.queryByText(pl.tabs.settings)).toBeNull();
});

it("selects an inactive tab on press", () => {
  const onSelect = vi.fn();
  renderBar("today", onSelect);
  fireEvent.click(screen.getByRole("tab", { name: pl.tabs.head }));
  expect(onSelect).toHaveBeenCalledWith("head");
});

it("selects an inactive tab when its icon is pressed", () => {
  const onSelect = vi.fn();
  renderBar("today", onSelect);
  const icon = screen
    .getByRole("tab", { name: pl.tabs.head })
    .querySelector("svg") as SVGElement;
  fireEvent.click(icon);
  expect(onSelect).toHaveBeenCalledWith("head");
});

it("gives every tab a touch target of at least 44 px", () => {
  renderBar("today");
  for (const tab of screen.getAllByRole("tab")) {
    const style = getComputedStyle(tab);
    expect(parseFloat(style.minWidth)).toBeGreaterThanOrEqual(44);
    expect(parseFloat(style.minHeight)).toBeGreaterThanOrEqual(44);
  }
});

it("fits five tabs with the longest label on a 320 px screen", () => {
  renderBar("settings");
  const labelWidth = pl.tabs.settings.length * 0.55 * fontSizes.tab;
  expect(tabBarMinWidth(5, labelWidth)).toBeLessThanOrEqual(
    320 - 2 * TAB_BAR_SIDE,
  );
  const [first, active] = [
    getComputedStyle(screen.getAllByRole("tab")[0] as HTMLElement),
    getComputedStyle(screen.getByRole("tab", { name: pl.tabs.settings })),
  ];
  expect(active.flexShrink).toBe("0");
  expect(first.flexShrink).toBe("1");
});

it("keeps the icons and the label readable on the dark pill", () => {
  expect(contrastRatio(colors.onDark, colors.text)).toBeGreaterThanOrEqual(3);
  expect(contrastRatio(colors.text, colors.surface)).toBeGreaterThanOrEqual(
    4.5,
  );
});
