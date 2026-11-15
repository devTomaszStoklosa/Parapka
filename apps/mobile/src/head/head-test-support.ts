import type { ConsentCategory } from "../consent/consent-model";
import { createMemoryDatabase } from "../data/memory-database";
import { createPairRepository } from "../pairing/pair-repository";
import { createMemoryKeyStore } from "../platform/memory-key-store";
import { createHandlerRegistry } from "../sync/handler-registry";
import { createPairedDevices, type Device } from "../sync/sync-test-support";
import { createChoreHandler } from "../chores/chore-handler";
import { createChoreRepository } from "../chores/chore-repository";
import { createCarrierHandler } from "./carrier-handler";
import { createCarrierRepository } from "./carrier-repository";
import { convertToChore } from "./convert-to-chore";
import { createHeadService } from "./head-service";
import { createItemHandler } from "./item-handler";
import { createItemRepository } from "./item-repository";

/** Ids "<prefix>-1", "<prefix>-2", ... so that the lists are in order. */
const counter = (prefix: string) => {
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

/** Items, chores and carriers on one database, with the conversion between them. */
function buildConversion(
  database: Device["database"],
  pairs: Device["pairs"],
  id: string,
) {
  const time = { now: 1_800_000_000_000 };
  const clock = { nowMs: () => time.now };
  const identity = { deviceId: () => Promise.resolve(id) };
  let last = 0;
  const newId = () => `${id}-${String((last += 1))}`;
  const items = createItemRepository({ database, pairs, clock, newId });
  const chores = createChoreRepository({ database, pairs, identity, newId });
  const carriers = createCarrierRepository({ database, identity, clock });
  const head = createHeadService({ items, carriers, pairs, identity, clock });
  const deps = { head, items, chores, clock };
  return {
    items,
    chores,
    carriers,
    head,
    time,
    deps,
    convert: (itemId: string) => convertToChore(deps, itemId),
  };
}

function withConversion(device: Device) {
  const set = buildConversion(device.database, device.pairs, device.id);
  const registry = createHandlerRegistry();
  registry.register(createItemHandler(set));
  registry.register(createChoreHandler(set));
  registry.register(createCarrierHandler(set));
  device.restart({ registry });
  return set;
}

/** A device that has no pair. */
export function createSingleConversion() {
  const database = createMemoryDatabase();
  const pairs = createPairRepository(database, createMemoryKeyStore());
  return buildConversion(database, pairs, "solo");
}

/** Two paired devices that can turn their things into chores. */
export async function setupConversionPair() {
  const devices = await createPairedDevices();
  return {
    ...devices,
    ua: withConversion(devices.a),
    ub: withConversion(devices.b),
  };
}

export { exchange } from "../chores/chore-test-support";
