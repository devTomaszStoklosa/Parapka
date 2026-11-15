// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";

import { press, setup, useSodium } from "../chores/planner-test-support";
import { pl } from "../i18n/pl";
import { PlatformProvider, type Platform } from "../platform/context";
import { createPauseRepository } from "../sync/pause-repository";
import { TodayPause } from "./TodayPause";

useSodium();
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const show = (platform: Platform) =>
  render(
    <PlatformProvider platform={platform}>
      <TodayPause />
    </PlatformProvider>,
  );
const toggle = () => screen.findByRole("switch", { name: pl.pause.label });
const checked = (el: HTMLElement) => (el as HTMLInputElement).checked;

it("switches the pause on and off with one touch each", async () => {
  const { platform } = await setup(true);
  const pause = createPauseRepository(platform.database);
  show(platform);
  expect(await screen.findByText(pl.pause.hint)).toBeTruthy();
  await press(pl.pause.label, "switch");
  await waitFor(async () => {
    expect(await pause.isPaused()).toBe(true);
  });
  await press(pl.pause.label, "switch");
  await waitFor(async () => {
    expect(await pause.isPaused()).toBe(false);
  });
});

const partner = {
  pairMailboxId: "mailbox",
  deviceId: "device-partner",
  signingPublicKey: "s",
  agreementPublicKey: "a",
};
const settle = () => new Promise((resolve) => setTimeout(resolve, 20));

/** A platform whose pair is removed; `keys` are those of the removed pair. */
async function unpaired() {
  const phone = await setup(true);
  const keys = await phone.pairs.keys();
  if (!keys) throw new Error("no keys");
  await phone.pairs.remove();
  return { ...phone, keys };
}

it("has no switch without a pair or with a pending one", async () => {
  const { platform, pairs, keys } = await unpaired();
  show(platform);
  await settle();
  expect(screen.queryByText(pl.pause.hint)).toBeNull();
  await pairs.savePending(partner, keys);
  await settle();
  expect(screen.queryByText(pl.pause.hint)).toBeNull();
});

it("appears after the confirmation and goes away after the disconnect", async () => {
  const { platform, pairs, keys } = await unpaired();
  await pairs.savePending(partner, keys);
  show(platform);
  await settle();
  expect(screen.queryByText(pl.pause.hint)).toBeNull();
  await pairs.confirm();
  expect(await toggle()).toBeTruthy();
  await pairs.remove();
  await waitFor(() => {
    expect(screen.queryByText(pl.pause.hint)).toBeNull();
  });
});

it("shows the pause set elsewhere", async () => {
  const { platform } = await setup(true);
  show(platform);
  expect(checked(await toggle())).toBe(false);
  await createPauseRepository(platform.database).setPaused(true);
  await waitFor(async () => {
    expect(checked(await toggle())).toBe(true);
  });
});

it("has no switch when the pair cannot be read", async () => {
  const { platform } = await setup(true);
  vi.spyOn(platform.database, "get").mockRejectedValue(new Error("x"));
  show(platform);
  await new Promise((resolve) => setTimeout(resolve, 20));
  expect(screen.queryByText(pl.pause.hint)).toBeNull();
});

it("says the pause failed when it cannot be saved", async () => {
  const { platform } = await setup(true);
  show(platform);
  await toggle();
  vi.spyOn(platform.database, "put").mockRejectedValue(new Error("x"));
  await press(pl.pause.label, "switch");
  expect(await screen.findByText(pl.pause.failed)).toBeTruthy();
});
