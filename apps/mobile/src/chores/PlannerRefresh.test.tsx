// @vitest-environment jsdom
import type { PairKeys } from "@parapka/crypto";
import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeAll, expect, it } from "vitest";

import { createMemoryDatabase } from "../data/memory-database";
import { PlatformProvider, type Platform } from "../platform/context";
import { createMemoryKeyStore } from "../platform/memory-key-store";
import { webSha256 } from "../platform/sha256";
import { createWebSodium } from "../platform/web-sodium";
import { wireChores } from "../sync/wiring";
import { PlannerScreen } from "./PlannerScreen";

const NOW = new Date(2026, 10, 11, 12).getTime();
const KEYS: PairKeys = {
  sendKey: new Uint8Array(32).fill(1),
  receiveKey: new Uint8Array(32).fill(2),
};

let sodium: Platform["sodium"];

beforeAll(async () => {
  sodium = await createWebSodium();
});

afterEach(cleanup);

async function setup() {
  const platform: Platform = {
    sodium,
    keyStore: createMemoryKeyStore(),
    clock: { nowMs: () => NOW },
    database: createMemoryDatabase(),
    sha256: webSha256,
    relayUrl: "unused",
    appUrl: "unused",
  };
  await platform.database.put("identity", "device", {
    signingPublicKey: "s",
    agreementPublicKey: "a",
    deviceId: "device-me",
  });
  const view = render(
    <PlatformProvider platform={platform}>
      <PlannerScreen />
    </PlatformProvider>,
  );
  return { ...wireChores(platform), view };
}

const rule = { kind: "daily" } as const;
const me = { kind: "person", person: "me" } as const;

it("shows a chore added in the background, without a remount", async () => {
  const { chores } = await setup();
  await screen.findByText(/Nie masz jeszcze/);
  await act(async () => {
    await chores.add({ title: "Zmywanie", rule, assignment: me });
  });
  expect((await screen.findAllByText("Zmywanie")).length).toBeGreaterThan(0);
});

it("shows a check-off that the synchronization took in", async () => {
  const { chores, completions } = await setup();
  const { id } = await chores.add({ title: "Zmywanie", rule, assignment: me });
  await screen.findAllByText("Zmywanie");
  expect(screen.queryByText("Odhaczone")).toBeNull();
  await act(async () => {
    await completions.complete(id, "2026-11-11");
  });
  expect(await screen.findByText("Odhaczone")).toBeTruthy();
});

it("shows the filter when the pair appears", async () => {
  const { chores, pairs } = await setup();
  await chores.add({ title: "Zmywanie", rule, assignment: me });
  await screen.findAllByText("Zmywanie");
  expect(screen.queryByRole("radiogroup", { name: "Filtr" })).toBeNull();
  await act(async () => {
    await pairs.savePending(
      {
        pairMailboxId: "mailbox",
        deviceId: "device-partner",
        signingPublicKey: "s",
        agreementPublicKey: "a",
      },
      KEYS,
    );
    await pairs.confirm();
  });
  expect(await screen.findByRole("radiogroup", { name: "Filtr" })).toBeTruthy();
});
