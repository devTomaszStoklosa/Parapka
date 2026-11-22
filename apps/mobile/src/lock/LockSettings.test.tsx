// @vitest-environment jsdom
import type { Sodium } from "@parapka/crypto";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import { afterEach, beforeAll, expect, it } from "vitest";

import { createMemoryDatabase } from "../data/memory-database";
import { t } from "../i18n";
import { PlatformProvider, type Platform } from "../platform/context";
import { createMemoryKeyStore } from "../platform/memory-key-store";
import { webSha256 } from "../platform/sha256";
import { createWebSodium } from "../platform/web-sodium";
import { LockSettings } from "./LockSettings";
import { createPinStore } from "./pin-store";

let sodium: Sodium;

beforeAll(async () => {
  sodium = await createWebSodium();
});

afterEach(cleanup);

async function setup(withPin: boolean) {
  const clock = { nowMs: () => 1_000 };
  const database = createMemoryDatabase();
  const store = createPinStore({ database, sodium, clock });
  if (withPin) await store.setPin("123456");
  const platform: Platform = {
    sodium,
    keyStore: createMemoryKeyStore(),
    clock,
    database,
    sha256: webSha256,
    relayUrl: "unused",
    appUrl: "unused",
  };
  render(
    <PlatformProvider platform={platform}>
      <LockSettings />
    </PlatformProvider>,
  );
  await act(() => Promise.resolve());
  return store;
}

async function typePin(pin: string) {
  pin.split("").forEach((digit, index) => {
    fireEvent.change(screen.getByLabelText(`Cyfra ${String(index + 1)} z 6`), {
      target: { value: digit },
    });
  });
  await act(() => Promise.resolve());
  await act(() => Promise.resolve());
}

it("offers only setting the PIN without one", async () => {
  await setup(false);
  expect(screen.getByText(t("lock.settings.set"))).toBeTruthy();
  expect(screen.queryByText(t("lock.settings.change"))).toBeNull();
  expect(screen.queryByRole("radiogroup")).toBeNull();
});

it("offers changing the PIN and the timeout with a PIN", async () => {
  await setup(true);
  expect(screen.queryByText(t("lock.settings.set"))).toBeNull();
  expect(screen.getByText(t("lock.settings.change"))).toBeTruthy();
  expect(
    screen
      .getByRole("radio", { name: t("lock.settings.immediately") })
      .getAttribute("aria-checked"),
  ).toBe("true");
});

it("sets the PIN after it was typed twice", async () => {
  const store = await setup(false);
  fireEvent.click(screen.getByText(t("lock.settings.set")));
  await typePin("246810");
  await typePin("246810");
  expect(await store.verifyPin("246810")).toBe(true);
  expect(screen.getByText(t("lock.settings.change"))).toBeTruthy();
});

it("changes the PIN only after the current one and counts a wrong one", async () => {
  const store = await setup(true);
  fireEvent.click(screen.getByText(t("lock.settings.change")));
  await typePin("000000");
  expect((await store.loadSettings()).failedAttempts).toBe(1);
  await typePin("123456");
  await typePin("246810");
  await typePin("246810");
  expect(await store.verifyPin("123456")).toBe(false);
  expect(await store.verifyPin("246810")).toBe(true);
});

it("cancels setting the PIN without saving it", async () => {
  const store = await setup(false);
  fireEvent.click(screen.getByText(t("lock.settings.set")));
  await typePin("246810");
  fireEvent.click(screen.getByText(t("lock.settings.cancel")));
  expect(screen.getByText(t("lock.settings.set"))).toBeTruthy();
  expect(screen.queryByText(t("lock.settings.cancel"))).toBeNull();
  expect(await store.hasPin()).toBe(false);
});

it("cancels changing the PIN and keeps the old one", async () => {
  const store = await setup(true);
  fireEvent.click(screen.getByText(t("lock.settings.change")));
  await typePin("123456");
  await typePin("246810");
  fireEvent.click(screen.getByText(t("lock.settings.cancel")));
  expect(screen.getByText(t("lock.settings.change"))).toBeTruthy();
  expect(await store.verifyPin("123456")).toBe(true);
  expect(await store.verifyPin("246810")).toBe(false);
});

it("saves the chosen timeout", async () => {
  const store = await setup(true);
  fireEvent.click(
    screen.getByRole("radio", { name: t("lock.settings.fiveMinutes") }),
  );
  await act(() => Promise.resolve());
  expect((await store.loadSettings()).timeout).toBe("fiveMinutes");
  expect(
    screen
      .getByRole("radio", { name: t("lock.settings.fiveMinutes") })
      .getAttribute("aria-checked"),
  ).toBe("true");
});
