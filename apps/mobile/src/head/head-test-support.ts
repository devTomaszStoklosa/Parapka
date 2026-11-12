import type { ConsentCategory } from "../consent/consent-model";
import { createMemoryDatabase } from "../data/memory-database";
import { createPairRepository } from "../pairing/pair-repository";
import { createMemoryKeyStore } from "../platform/memory-key-store";
import { createHandlerRegistry } from "../sync/handler-registry";
import { createPairedDevices, type Device } from "../sync/sync-test-support";
import { createItemHandler } from "./item-handler";
import { createItemRepository } from "./item-repository";

/** Ids "<prefix>-1", "<prefix>-2", ... so that the lists are in order. */
export const counter = (prefix: string) => {
  let last = 0;
  return () => `${prefix}-${String((last += 1))}`;
};

/** The repository and the handler of a device, as the engine will run them. */
export function withItems(
  device: Device,
  isShared?: (category: ConsentCategory) => boolean,
) {
  // The moment of the next "done"; the tests move it.
  const time = { now: 1_800_000_000_000 };
  const items = createItemRepository({
    database: device.database,
    pairs: device.pairs,
    clock: { nowMs: () => time.now },
    newId: counter(device.id),
  });
  const handler = createItemHandler({ items });
  const registry = createHandlerRegistry();
  registry.register(handler);
  device.restart({ registry, isShared });
  return { items, handler, time };
}

/** A device that has no pair. */
export function createSingleDevice() {
  const database = createMemoryDatabase();
  const pairs = createPairRepository(database, createMemoryKeyStore());
  const items = createItemRepository({
    database,
    pairs,
    clock: { nowMs: () => 1_800_000_000_000 },
    newId: counter("solo"),
  });
  return { database, items };
}

/** Two paired devices with the real repositories and handlers. */
export async function setupItemPair(isShared?: () => boolean) {
  const devices = await createPairedDevices();
  const ua = withItems(devices.a, isShared);
  const ub = withItems(devices.b, isShared);
  return { ...devices, ia: ua.items, ib: ub.items, ua, ub };
}

export { exchange } from "../chores/chore-test-support";
