import type { ConsentCategory } from "../consent/consent-model";
import { createMemoryDatabase } from "../data/memory-database";
import { createPairRepository } from "../pairing/pair-repository";
import { createMemoryKeyStore } from "../platform/memory-key-store";
import { createHandlerRegistry } from "../sync/handler-registry";
import { createPairedDevices, type Device } from "../sync/sync-test-support";
import { createCarrierHandler } from "./carrier-handler";
import { createCarrierRepository } from "./carrier-repository";
import { createHeadService } from "./head-service";
import { createItemHandler } from "./item-handler";
import { counter } from "./head-test-support";
import { createItemRepository } from "./item-repository";

function build(
  database: Device["database"],
  pairs: Device["pairs"],
  id: string,
  time: { now: number },
) {
  const identity = { deviceId: () => Promise.resolve(id) };
  const clock = { nowMs: () => time.now };
  const items = createItemRepository({
    database,
    pairs,
    clock,
    newId: counter(id),
  });
  const carriers = createCarrierRepository({ database, identity, clock });
  const head = createHeadService({ items, carriers, pairs, identity });
  return { items, carriers, head };
}

/** The repositories, handlers and service of a device, as the engine runs them. */
export function withHead(
  device: Device,
  isShared?: (category: ConsentCategory) => boolean,
) {
  // The moment of the next entry; the tests move it.
  const time = { now: 1_800_000_000_000 };
  const set = build(device.database, device.pairs, device.id, time);
  const itemHandler = createItemHandler(set);
  const carrierHandler = createCarrierHandler(set);
  const registry = createHandlerRegistry();
  registry.register(itemHandler);
  registry.register(carrierHandler);
  device.restart({ registry, isShared });
  return { ...set, itemHandler, carrierHandler, time };
}

/** Two paired devices with the real head repositories and handlers. */
export async function setupHeadPair(isShared?: () => boolean) {
  const devices = await createPairedDevices();
  const ua = withHead(devices.a, isShared);
  const ub = withHead(devices.b, isShared);
  return { ...devices, ua, ub };
}

/** A device that has no pair. */
export function createSingleHead() {
  const database = createMemoryDatabase();
  const pairs = createPairRepository(database, createMemoryKeyStore());
  return { database, pairs, ...build(database, pairs, "solo", { now: 1 }) };
}

export { exchange } from "../chores/chore-test-support";
