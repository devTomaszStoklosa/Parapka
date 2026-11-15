import { afterEach, beforeAll, expect, it, vi } from "vitest";

import { wireChores } from "../chores/wiring";
import { createMemoryDatabase } from "../data/memory-database";
import { createProfileRepository } from "../data/profile-repository";
import { wireCycle, wireCycleHints } from "../cycle/wiring";
import type { Platform } from "../platform/context";
import { createMemoryKeyStore } from "../platform/memory-key-store";
import { webSha256 } from "../platform/sha256";
import { createWebSodium } from "../platform/web-sodium";
import { profile } from "../sync/wiring-test-support";
import { wireCheckin } from "./wiring";

let sodium: Awaited<ReturnType<typeof createWebSodium>>;

beforeAll(async () => {
  sodium = await createWebSodium();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

const NOW = new Date(2026, 10, 8, 12).getTime();

// A device that was never registered at the relay: the network always fails.
const platform = (): Platform => ({
  sodium,
  keyStore: createMemoryKeyStore(),
  clock: { nowMs: () => NOW },
  database: createMemoryDatabase(),
  sha256: webSha256,
  relayUrl: "unused",
  appUrl: "unused",
});

it("saves the cycle, the hints and the check-in view without a pair or the relay", async () => {
  const fetch = vi.fn(() => Promise.reject(new Error("offline")));
  vi.stubGlobal("fetch", fetch);
  const own = platform();
  const { identity } = wireChores(own);
  expect(await identity.deviceId()).not.toBeNull();
  await createProfileRepository(own.database).save({
    ...profile,
    cycle: "yes",
  });

  const cycle = wireCycle(own);
  await cycle.savePeriod({ id: "p1", startDate: "2026-11-01", endDate: null });
  await cycle.saveWellbeing({
    date: cycle.today(),
    energy: 3,
    mood: 3,
    tension: 3,
    tags: [],
  });
  await wireCycleHints(own).generator.refresh();
  expect(
    await wireCycleHints(own).hints.range("2026-11-08", "2026-11-10"),
  ).toHaveLength(3);

  const { checkin } = wireCheckin(own);
  expect(await checkin.current()).toMatchObject({
    paired: false,
    status: "open",
  });
  // The check-in is a thing of the pair: without one it refuses, not on the id.
  await expect(
    checkin.submit({ mood: 3, energy: 3, closeness: 3 }),
  ).rejects.toThrow("there is no pair");
  expect(fetch).not.toHaveBeenCalled();
});
