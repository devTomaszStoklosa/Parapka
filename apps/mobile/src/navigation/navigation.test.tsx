// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { Sodium } from "@parapka/crypto";
import { afterEach, beforeAll, expect, it, vi } from "vitest";

import { createMemoryDatabase } from "../data/memory-database";
import { pl } from "../i18n/pl";
import { PlatformProvider, type Platform } from "../platform/context";
import { createMemoryKeyStore } from "../platform/memory-key-store";
import { webSha256 } from "../platform/sha256";
import { createWebSodium } from "../platform/web-sodium";
import { initialNavState, navReducer } from "./stack-state";
import { TabNavigator } from "./TabNavigator";

let sodium: Sodium;

beforeAll(async () => {
  sodium = await createWebSodium();
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function renderTabs(cycleEnabled: boolean) {
  const platform: Platform = {
    sodium,
    keyStore: createMemoryKeyStore(),
    clock: { nowMs: () => 1_000 },
    database: createMemoryDatabase(),
    sha256: webSha256,
    relayUrl: "unused",
    appUrl: "unused",
  };
  const tree = (enabled: boolean) => (
    <PlatformProvider platform={platform}>
      <TabNavigator cycleEnabled={enabled} />
    </PlatformProvider>
  );
  const view = render(tree(cycleEnabled));
  return {
    rerender: (enabled: boolean) => {
      view.rerender(tree(enabled));
    },
  };
}

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
  renderTabs(true);
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
  renderTabs(false);
  expect(screen.getAllByRole("tab")).toHaveLength(4);
  expect(screen.queryByRole("tab", { name: pl.tabs.cycle })).toBeNull();
});

it("falls back to today when the active cycle tab disappears", () => {
  const { rerender } = renderTabs(true);
  fireEvent.click(screen.getByRole("tab", { name: pl.tabs.cycle }));
  expect(screen.getByRole("heading").textContent).toBe(pl.screens.cycle.title);
  rerender(false);
  expect(screen.getByRole("heading").textContent).toBe(pl.screens.today.title);

  fireEvent.click(screen.getByText(pl.screens.push));
  expect(screen.getByText("Poziom stosu: 2")).toBeTruthy();
  rerender(true);
  expect(screen.getByRole("heading").textContent).toBe(pl.screens.today.title);
});

it("switches tabs and keeps a separate stack per tab", () => {
  renderTabs(true);
  expect(screen.getByRole("heading").textContent).toBe(pl.screens.today.title);

  fireEvent.click(screen.getByText(pl.screens.push));
  expect(screen.getByText("Poziom stosu: 2")).toBeTruthy();

  fireEvent.click(screen.getByRole("tab", { name: pl.tabs.cycle }));
  expect(screen.getByRole("heading").textContent).toBe(pl.screens.cycle.title);
  expect(screen.getByText("Poziom stosu: 1")).toBeTruthy();

  fireEvent.click(screen.getByRole("tab", { name: pl.tabs.today }));
  expect(screen.getByText("Poziom stosu: 2")).toBeTruthy();

  fireEvent.click(screen.getByText(pl.screens.pop));
  expect(screen.getByText("Poziom stosu: 1")).toBeTruthy();
});

it("returns to the root when the active tab is touched again", () => {
  renderTabs(true);
  fireEvent.click(screen.getByText(pl.screens.push));
  fireEvent.click(screen.getByText(pl.screens.push));
  expect(screen.getByText("Poziom stosu: 3")).toBeTruthy();
  fireEvent.click(screen.getByRole("tab", { name: pl.tabs.today }));
  expect(screen.getByText("Poziom stosu: 1")).toBeTruthy();
});

it.each(["today", "cycle", "planner", "head", "settings"] as const)(
  "shows the title of the %s tab",
  (tab) => {
    renderTabs(true);
    fireEvent.click(screen.getByRole("tab", { name: pl.tabs[tab] }));
    expect(screen.getByRole("heading").textContent).toBe(pl.screens[tab].title);
  },
);

it("shows the pairing section in the settings tab", async () => {
  vi.stubGlobal("fetch", () => Promise.reject(new Error("offline")));
  renderTabs(true);
  fireEvent.click(screen.getByRole("tab", { name: pl.tabs.settings }));
  expect(screen.getByText(pl.pairing.title)).toBeTruthy();
  expect(await screen.findByText(pl.pairing.unavailable)).toBeTruthy();
});

it("shows the planner in the planner tab", async () => {
  renderTabs(true);
  fireEvent.click(screen.getByRole("tab", { name: pl.tabs.planner }));
  expect(await screen.findByText(pl.planner.empty.text)).toBeTruthy();
});
