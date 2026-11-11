import type { ConsentCategory } from "../consent/consent-model";
import { createMemoryDatabase } from "../data/memory-database";
import { createPairRepository } from "../pairing/pair-repository";
import { createMemoryKeyStore } from "../platform/memory-key-store";
import { createHandlerRegistry } from "../sync/handler-registry";
import type { Device } from "../sync/sync-test-support";
import { createChoreHandler } from "./chore-handler";
import { createChoreRepository } from "./chore-repository";

export const WEEKDAYS = { kind: "weekdays", weekdays: [1, 4] } as const;
export const ME = { kind: "person", person: "me" } as const;
export const PARTNER = { kind: "person", person: "partner" } as const;

/** Ids "<prefix>-1", "<prefix>-2", ... so that the lists are in order. */
const counter = (prefix: string) => {
  let last = 0;
  return () => `${prefix}-${String((last += 1))}`;
};

/** The repository and the handler of a device, as the engine will run them. */
export function withChores(
  device: Device,
  isShared?: (category: ConsentCategory) => boolean,
) {
  const chores = createChoreRepository({
    database: device.database,
    pairs: device.pairs,
    identity: { deviceId: () => Promise.resolve(device.id) },
    newId: counter(device.id),
  });
  const handler = createChoreHandler({ chores });
  const registry = createHandlerRegistry();
  registry.register(handler);
  device.restart({ registry, isShared });
  return { chores, handler };
}

/** A device that has no pair; `deviceId` null stands for an unregistered one. */
export function createSingleDevice(deviceId: string | null = "device-solo") {
  const database = createMemoryDatabase();
  const pairs = createPairRepository(database, createMemoryKeyStore());
  const chores = createChoreRepository({
    database,
    pairs,
    identity: { deviceId: () => Promise.resolve(deviceId) },
    newId: counter("solo"),
  });
  return { database, pairs, chores, handler: createChoreHandler({ chores }) };
}
