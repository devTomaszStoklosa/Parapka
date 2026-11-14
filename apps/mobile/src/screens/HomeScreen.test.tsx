// @vitest-environment jsdom
import { HINT_DAYS_AHEAD } from "@parapka/domain";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";

import { createMemoryDatabase } from "../data/memory-database";
import { pl } from "../i18n/pl";
import { PlatformProvider, type Platform } from "../platform/context";
import { createMemoryKeyStore } from "../platform/memory-key-store";
import { webSha256 } from "../platform/sha256";
import { createWebSodium } from "../platform/web-sodium";
import { TabNavigator } from "../navigation/TabNavigator";
import { HomeScreen } from "./HomeScreen";

afterEach(cleanup);

it("renders the texts from the translation file", () => {
  render(<HomeScreen />);
  expect(screen.getByText(pl.home.title)).toBeTruthy();
  expect(screen.getByText(pl.home.subtitle)).toBeTruthy();
  expect(
    screen.getByText(pl.home.hintWindow + " " + String(HINT_DAYS_AHEAD)),
  ).toBeTruthy();
});

it("renders the tab navigator", async () => {
  const platform: Platform = {
    sodium: await createWebSodium(),
    keyStore: createMemoryKeyStore(),
    clock: { nowMs: () => 1_000 },
    database: createMemoryDatabase(),
    sha256: webSha256,
    relayUrl: "unused",
    appUrl: "unused",
  };
  render(
    <PlatformProvider platform={platform}>
      <TabNavigator cycleEnabled={false} />
    </PlatformProvider>,
  );
  expect(screen.getByRole("heading").textContent).toBe(pl.screens.today.title);
  expect(screen.getAllByRole("tab")).toHaveLength(4);
  await screen.findByText(pl.checkin.card.noPair);
});
