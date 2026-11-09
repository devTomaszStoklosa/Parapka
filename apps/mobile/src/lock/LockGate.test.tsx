// @vitest-environment jsdom
import type { Sodium } from "@parapka/crypto";
import type { Clock } from "@parapka/domain";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import { afterEach, beforeAll, beforeEach, expect, it } from "vitest";

import { createMemoryDatabase } from "../data/memory-database";
import { t } from "../i18n";
import { createMemoryKeyStore } from "../platform/memory-key-store";
import { createWebSodium } from "../platform/web-sodium";
import { LockGate } from "./LockGate";
import type { LockTimeout } from "./lock-state";
import { createPinStore, type PinStore } from "./pin-store";

let sodium: Sodium;
let visibility = "visible";
let contentRenders = 0;

function Content() {
  contentRenders += 1;
  return <div>secret content</div>;
}

beforeAll(async () => {
  sodium = await createWebSodium();
});

beforeEach(() => {
  visibility = "visible";
  contentRenders = 0;
  Object.defineProperty(document, "visibilityState", {
    configurable: true,
    get: () => visibility,
  });
});

afterEach(cleanup);

function setAppState(state: "visible" | "hidden") {
  visibility = state;
  act(() => {
    document.dispatchEvent(new Event("visibilitychange"));
  });
}

async function setup(withPin = true, timeout?: LockTimeout) {
  let now = 1_000;
  const clock: Clock = { nowMs: () => now };
  const database = createMemoryDatabase();
  const keyStore = createMemoryKeyStore();
  const store: PinStore = createPinStore({ database, sodium, clock });
  if (withPin) await store.setPin("123456");
  if (timeout) await store.setTimeout(timeout);
  await keyStore.set("secret", Uint8Array.of(1));
  render(
    <LockGate
      database={database}
      keyStore={keyStore}
      sodium={sodium}
      clock={clock}
    >
      <Content />
    </LockGate>,
  );
  return {
    database,
    keyStore,
    store,
    advance: (ms: number) => {
      now += ms;
    },
  };
}

async function unlockWith(pin: string) {
  pin.split("").forEach((digit, index) => {
    fireEvent.change(screen.getByLabelText(`Cyfra ${String(index + 1)} z 6`), {
      target: { value: digit },
    });
  });
  await screen.findByText("secret content");
}

it("shows the PIN screen, not the content, on start", async () => {
  await setup();
  expect(await screen.findByText(t("lock.pin.unlockTitle"))).toBeTruthy();
  expect(screen.queryByText("secret content")).toBeNull();
});

it("shows the content when no PIN is set", async () => {
  await setup(false);
  expect(await screen.findByText("secret content")).toBeTruthy();
});

it("unlocks with the right PIN", async () => {
  await setup();
  await screen.findByText(t("lock.pin.unlockTitle"));
  await unlockWith("123456");
  expect(screen.queryByText(t("lock.pin.unlockTitle"))).toBeNull();
});

it("covers the content in the background and locks before it on return", async () => {
  await setup();
  await screen.findByText(t("lock.pin.unlockTitle"));
  await unlockWith("123456");
  expect(screen.queryByTestId("lock-veil")).toBeNull();

  setAppState("hidden");
  expect(screen.getByTestId("lock-veil")).toBeTruthy();

  setAppState("visible");
  expect(screen.queryByTestId("lock-veil")).toBeNull();
  expect(screen.queryByText("secret content")).toBeNull();
  expect(screen.getByText(t("lock.pin.unlockTitle"))).toBeTruthy();
});

it("locks after a 1 minute timeout only when the time has passed", async () => {
  const { advance } = await setup(true, "oneMinute");
  await screen.findByText(t("lock.pin.unlockTitle"));
  await unlockWith("123456");

  setAppState("hidden");
  advance(30_000);
  setAppState("visible");
  expect(screen.getByText("secret content")).toBeTruthy();

  setAppState("hidden");
  advance(60_000);
  setAppState("visible");
  expect(screen.queryByText("secret content")).toBeNull();
  expect(screen.getByText(t("lock.pin.unlockTitle"))).toBeTruthy();
});

it("does not render the content once after the time set for the lock", async () => {
  const { advance } = await setup(true, "oneMinute");
  await screen.findByText(t("lock.pin.unlockTitle"));
  await unlockWith("123456");

  setAppState("hidden");
  advance(60_000);
  contentRenders = 0;
  setAppState("visible");
  expect(contentRenders).toBe(0);
  expect(screen.queryByText("secret content")).toBeNull();
});

it("resets the app after the forgotten PIN is confirmed twice", async () => {
  const { database, keyStore } = await setup();
  fireEvent.click(
    await screen.findByRole("button", { name: t("lock.pin.forgot") }),
  );
  fireEvent.click(
    screen.getByRole("button", { name: t("lock.reset.continue") }),
  );
  expect(await keyStore.get("secret")).not.toBeNull();
  fireEvent.click(
    screen.getByRole("button", { name: t("lock.reset.confirm") }),
  );
  expect(await screen.findByText("secret content")).toBeTruthy();
  expect(await keyStore.get("secret")).toBeNull();
  expect(await database.list("lock")).toEqual([]);
});

it("returns from the reset screen to the PIN screen", async () => {
  await setup();
  fireEvent.click(
    await screen.findByRole("button", { name: t("lock.pin.forgot") }),
  );
  fireEvent.click(screen.getByRole("button", { name: t("lock.reset.cancel") }));
  expect(await screen.findByText(t("lock.pin.unlockTitle"))).toBeTruthy();
});
