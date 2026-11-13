// @vitest-environment jsdom
import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";

import { createMemoryDatabase } from "../data/memory-database";
import { t } from "../i18n";
import { PlatformProvider, type Platform } from "../platform/context";
import { createMemoryKeyStore } from "../platform/memory-key-store";
import { webSha256 } from "../platform/sha256";
import { createWebSodium } from "../platform/web-sodium";
import { SettingsScreen } from "./SettingsScreen";

afterEach(cleanup);

it("keeps the whole content in a scrollable container", async () => {
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
      <SettingsScreen />
    </PlatformProvider>,
  );
  await act(() => Promise.resolve());
  const scroll = screen.getByTestId("settings-scroll");
  expect(scroll.contains(screen.getByText(t("pairing.title")))).toBe(true);
  expect(getComputedStyle(scroll).overflowY).toBe("auto");
});
