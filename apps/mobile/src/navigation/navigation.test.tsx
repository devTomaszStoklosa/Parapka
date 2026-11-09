// @vitest-environment jsdom
import type { ReactNode } from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeAll, expect, it } from "vitest";

import { createMemoryDatabase } from "../data/memory-database";
import { PlatformProvider, type Platform } from "../platform/context";
import { createMemoryKeyStore } from "../platform/memory-key-store";
import { webSha256 } from "../platform/sha256";
import { createWebSodium } from "../platform/web-sodium";

import { pl } from "../i18n/pl";
import { initialNavState, navReducer } from "./stack-state";
import { TabNavigator } from "./TabNavigator";

afterEach(cleanup);

let platform: Platform;

beforeAll(async () => {
  platform = {
    sodium: await createWebSodium(),
    keyStore: createMemoryKeyStore(),
    clock: { nowMs: () => 0 },
    database: createMemoryDatabase(),
    sha256: webSha256,
    relayUrl: "unused",
  };
});

/** The settings tab reads the platform; the other tabs ignore it. */
const withPlatform = (children: ReactNode) => (
  <PlatformProvider platform={platform}>{children}</PlatformProvider>
);

it("reducer pushes, pops and resets the stack of the active tab only", () => {
  let s = navReducer(initialNavState, { type: "push" });
  s = navReducer(s, { type: "push" });
  expect(s.depth.today).toBe(3);
  s = navReducer(s, { type: "pop" });
  expect(s.depth.today).toBe(2);
  s = navReducer(s, { type: "select", tab: "planner" });
  expect(s.active).toBe("planner");
  expect(s.depth.today).toBe(2);
  s = navReducer(s, { type: "select", tab: "today" });
  s = navReducer(s, { type: "select", tab: "today" });
  expect(s.depth.today).toBe(1);
  expect(navReducer(s, { type: "pop" }).depth.today).toBe(1);
});

it("shows five accessible tabs with a selected state", () => {
  render(withPlatform(<TabNavigator cycleEnabled />));
  const tabs = screen.getAllByRole("tab");
  expect(tabs.map((tab) => tab.getAttribute("aria-label"))).toEqual(
    Object.values(pl.tabs),
  );
  expect(tabs[0]?.getAttribute("aria-selected")).toBe("true");
  expect(tabs[1]?.getAttribute("aria-selected")).toBe("false");
  for (const tab of tabs) {
    const style = getComputedStyle(tab);
    expect(parseFloat(style.minWidth)).toBeGreaterThanOrEqual(44);
    expect(parseFloat(style.minHeight)).toBeGreaterThanOrEqual(44);
  }
});

it("hides the cycle tab when the panel is disabled", () => {
  render(withPlatform(<TabNavigator cycleEnabled={false} />));
  expect(screen.getAllByRole("tab")).toHaveLength(4);
  expect(screen.queryByRole("tab", { name: pl.tabs.cycle })).toBeNull();
});

it("falls back to today when the active cycle tab disappears", () => {
  const { rerender } = render(withPlatform(<TabNavigator cycleEnabled />));
  fireEvent.click(screen.getByRole("tab", { name: pl.tabs.cycle }));
  expect(screen.getByRole("heading").textContent).toBe(pl.screens.cycle.title);
  rerender(withPlatform(<TabNavigator cycleEnabled={false} />));
  expect(screen.getByRole("heading").textContent).toBe(pl.screens.today.title);

  fireEvent.click(screen.getByText(pl.screens.push));
  expect(screen.getByText("Poziom stosu: 2")).toBeTruthy();
  rerender(withPlatform(<TabNavigator cycleEnabled />));
  expect(screen.getByRole("heading").textContent).toBe(pl.screens.today.title);
});

it("switches tabs and keeps a separate stack per tab", () => {
  render(withPlatform(<TabNavigator cycleEnabled />));
  expect(screen.getByRole("heading").textContent).toBe(pl.screens.today.title);

  fireEvent.click(screen.getByText(pl.screens.push));
  expect(screen.getByText("Poziom stosu: 2")).toBeTruthy();

  fireEvent.click(screen.getByRole("tab", { name: pl.tabs.planner }));
  expect(screen.getByRole("heading").textContent).toBe(
    pl.screens.planner.title,
  );
  expect(screen.getByText("Poziom stosu: 1")).toBeTruthy();

  fireEvent.click(screen.getByRole("tab", { name: pl.tabs.today }));
  expect(screen.getByText("Poziom stosu: 2")).toBeTruthy();

  fireEvent.click(screen.getByText(pl.screens.pop));
  expect(screen.getByText("Poziom stosu: 1")).toBeTruthy();
});

it("returns to the root when the active tab is touched again", () => {
  render(withPlatform(<TabNavigator cycleEnabled />));
  fireEvent.click(screen.getByText(pl.screens.push));
  fireEvent.click(screen.getByText(pl.screens.push));
  expect(screen.getByText("Poziom stosu: 3")).toBeTruthy();
  fireEvent.click(screen.getByRole("tab", { name: pl.tabs.today }));
  expect(screen.getByText("Poziom stosu: 1")).toBeTruthy();
});

it.each(["today", "cycle", "planner", "head", "settings"] as const)(
  "shows the title of the %s tab",
  async (tab) => {
    render(withPlatform(<TabNavigator cycleEnabled />));
    fireEvent.click(screen.getByRole("tab", { name: pl.tabs[tab] }));
    expect(screen.getByRole("heading").textContent).toBe(pl.screens[tab].title);
    // Let the settings screen finish loading the pair.
    if (tab === "settings") await screen.findByText(pl.pairing.invite);
  },
);
