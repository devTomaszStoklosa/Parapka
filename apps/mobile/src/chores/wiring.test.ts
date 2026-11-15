import { afterEach, beforeAll, expect, it, vi } from "vitest";

import { createMemoryDatabase } from "../data/memory-database";
import { wireHead } from "../head/wiring";
import type { Platform } from "../platform/context";
import { createMemoryKeyStore } from "../platform/memory-key-store";
import { webSha256 } from "../platform/sha256";
import { createWebSodium } from "../platform/web-sodium";
import { ME, WEEKDAYS } from "./chore-test-support";
import { wireChores } from "./wiring";

type Sodium = Awaited<ReturnType<typeof createWebSodium>>;
let sodium: Sodium;

beforeAll(async () => {
  sodium = await createWebSodium();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

const NOW = new Date(2026, 10, 11, 12).getTime();

const platformOf = (storage?: Pick<Platform, "database" | "keyStore">) =>
  ({
    sodium,
    keyStore: storage?.keyStore ?? createMemoryKeyStore(),
    clock: { nowMs: () => NOW },
    database: storage?.database ?? createMemoryDatabase(),
    sha256: webSha256,
    relayUrl: "unused",
    appUrl: "unused",
  }) satisfies Platform;

it("saves chores, check-offs and head items without a pair, the relay or the network", async () => {
  const fetch = vi.fn(() => Promise.reject(new Error("offline")));
  vi.stubGlobal("fetch", fetch);
  const first = platformOf();
  const { chores, completions, identity } = wireChores(first);
  expect(await identity.deviceId()).not.toBeNull();

  const chore = await chores.add({
    title: "Wynieść śmieci",
    rule: WEEKDAYS,
    assignment: ME,
  });
  await completions.complete(chore.id, "2026-11-12");
  await wireHead(first).head.add({
    title: "Zapisać do lekarza",
    category: "other",
    weight: 2,
    carrier: "me",
  });
  expect(fetch).not.toHaveBeenCalled();

  // A reload: a new platform over the same storage.
  const second = platformOf(first);
  const again = wireChores(second);
  expect(await again.identity.deviceId()).toBe(await identity.deviceId());
  expect(await again.chores.list()).toMatchObject([
    { title: "Wynieść śmieci", assignment: ME },
  ]);
  expect(await again.completions.list()).toHaveLength(1);
  expect(await wireHead(second).head.list()).toMatchObject([
    { title: "Zapisać do lekarza", carrier: "me" },
  ]);
});
