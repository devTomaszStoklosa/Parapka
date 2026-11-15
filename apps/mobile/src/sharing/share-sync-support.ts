import { createChoreHandler } from "../chores/chore-handler";
import { createChoreRepository } from "../chores/chore-repository";
import { createChoreCompletionHandler } from "../chores/completion-handler";
import { createCompletionRepository } from "../chores/completion-repository";
import type { ConsentCategory } from "../consent/consent-model";
import { createCarrierHandler } from "../head/carrier-handler";
import { createCarrierRepository } from "../head/carrier-repository";
import { createHeadService } from "../head/head-service";
import { createItemHandler } from "../head/item-handler";
import { createItemRepository } from "../head/item-repository";
import {
  createHandlerRegistry,
  type SyncHandler,
} from "../sync/handler-registry";
import { createPairedDevices, type Device } from "../sync/sync-test-support";
import type { PairRepository } from "../pairing/pair-repository";
import { createSharePrivateService } from "./share-private";

export { exchange } from "../chores/chore-test-support";

interface Overrides {
  readonly canSync?: () => Promise<boolean>;
  readonly shared?: (category: ConsentCategory) => boolean;
  readonly paired?: boolean;
  /** Replaces the mailbox of the active pair, to stand for a new pairing. */
  readonly mailbox?: () => string;
}

/** Wraps a handler so that the entities it sends are noted in `sent`. */
function noting(handler: SyncHandler, sent: string[]): SyncHandler {
  return {
    ...handler,
    collect: async (nextHlc) => {
      const changes = await handler.collect(nextHlc);
      sent.push(...changes.map(({ entity }) => entity));
      return changes;
    },
  };
}

/** The pair the service sees: absent, or with the mailbox of a new pairing. */
function sharingPairs(
  pairs: Pick<PairRepository, "activePair">,
  overrides: Overrides,
): Pick<PairRepository, "activePair"> {
  if (overrides.paired === false) {
    return { activePair: () => Promise.resolve(null) };
  }
  return {
    activePair: async () => {
      const pair = await pairs.activePair();
      return pair && overrides.mailbox
        ? { ...pair, pairMailboxId: overrides.mailbox() }
        : pair;
    },
  };
}

/** The real repositories, handlers and service of one paired device. */
export function withSharing(device: Device, overrides: Overrides = {}) {
  const time = { now: 1_800_000_000_000 };
  const clock = { nowMs: () => time.now };
  const identity = { deviceId: () => Promise.resolve(device.id) };
  const { database, pairs } = device;
  const ids = { n: 0 };
  const newId = () => `${device.id}-${String((ids.n += 1))}`;
  const chores = createChoreRepository({ database, pairs, identity, newId });
  const completions = createCompletionRepository({
    database,
    chores,
    identity,
    clock,
  });
  const items = createItemRepository({ database, pairs, clock, newId });
  const carriers = createCarrierRepository({ database, identity, clock });
  const head = createHeadService({ items, carriers, pairs, identity, clock });
  const sent: string[] = [];
  const registry = createHandlerRegistry();
  for (const handler of [
    createChoreHandler({ chores }),
    createChoreCompletionHandler({ completions }),
    createItemHandler({ items }),
    createCarrierHandler({ carriers }),
  ]) {
    registry.register(noting(handler, sent));
  }
  device.restart({ registry });
  const service = createSharePrivateService({
    database,
    pairs: sharingPairs(pairs, overrides),
    consent: {
      canSync: overrides.canSync ?? (() => Promise.resolve(true)),
      isShared: (category) =>
        Promise.resolve(overrides.shared?.(category) ?? true),
    },
    chores,
    completions,
    items,
    carriers,
  });
  return { chores, completions, items, carriers, head, service, sent, time };
}

/** Two paired devices with the real repositories; A also has the service. */
export async function setupSharePair(overrides: Overrides = {}) {
  const devices = await createPairedDevices();
  const ua = withSharing(devices.a, overrides);
  const ub = withSharing(devices.b);
  return { ...devices, ua, ub };
}

const ME = { kind: "person", person: "me" } as const;
const DAILY = { kind: "daily" } as const;

/** A private chore of "me" with a check-off, and a private thing carried by "me". */
export async function seedPrivate(set: ReturnType<typeof withSharing>) {
  const chore = await set.chores.add(
    { title: "Podlać kwiaty", rule: DAILY, assignment: ME },
    { private: true },
  );
  await set.completions.complete(chore.id, "2026-11-10");
  const item = await set.head.add(
    { title: "Umówić wizytę" },
    { private: true },
  );
  return { choreId: chore.id, itemId: item.id };
}
