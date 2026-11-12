import {
  type Clock,
  ChoreValidationError,
  createMentalLoadItem,
  mentalLoadSplit,
  mentalLoadTrend,
  type MentalLoadCarrier,
  type MentalLoadSnapshot,
  type MentalLoadSplit,
} from "@parapka/domain";
import { currentCarriers, parseHlc } from "@parapka/sync";

import { ChoreDeviceError } from "../chores/chore-codec";
import type { Identity } from "../identity/identity";
import type { PairRepository } from "../pairing/pair-repository";
import type { CarrierRepository } from "./carrier-repository";
import type {
  AddOptions,
  ItemInput,
  ItemRepository,
  StoredItem,
} from "./item-repository";
import {
  currentLoad,
  relative,
  weekInputs,
  type SplitEntry,
} from "./split-model";

/** A new thing with the one who carries it (`me` unless said otherwise). */
export interface HeadInput extends ItemInput {
  readonly carrier?: MentalLoadCarrier;
}

/**
 * A thing to remember with its current carrier, as the screens see it. The
 * carrier is null while the item has no entry (it may come after the item).
 */
export interface HeadItem extends StoredItem {
  readonly carrier: MentalLoadCarrier | null;
}

export interface HeadService {
  /**
   * Creates the item and its first carrier entry. Without a pair only `me` is
   * allowed, and so for a private item. Throws on invalid input.
   */
  add(input: HeadInput, options?: AddOptions): Promise<HeadItem>;
  /**
   * "I take it" (FR-MNT-02): an open, shared item of the partner or of both;
   * an item that has no carrier yet is refused.
   */
  takeOver(itemId: string): Promise<void>;
  /** The items with their current carrier, as of the latest entry. */
  list(): Promise<HeadItem[]>;
  /**
   * The current split of the shared open items (FR-MNT-04); null when nothing
   * is open. Private items are left out: the partner cannot see them.
   */
  split(): Promise<MentalLoadSplit | null>;
  /** Weekly snapshots, oldest first, at most 12 weeks (FR-MNT-05). */
  trend(): Promise<MentalLoadSnapshot[]>;
  subscribe(listener: () => void): () => void;
}

interface Deps {
  items: ItemRepository;
  carriers: CarrierRepository;
  pairs: Pick<PairRepository, "activePair">;
  identity: Pick<Identity, "deviceId">;
  clock: Clock;
}

async function ownDevice({ identity }: Deps) {
  const deviceId = await identity.deviceId();
  if (deviceId === null) throw new ChoreDeviceError();
  return deviceId;
}

/** The `deviceId` (or `both`) that is stored for a carrier; throws when none. */
async function absolute(
  deps: Deps,
  carrier: MentalLoadCarrier,
  shared: boolean,
) {
  createMentalLoadItem({ category: "other", carrier });
  if (carrier === "me") {
    // A private item is mine even on a device that is not registered yet.
    return shared ? ownDevice(deps) : deps.identity.deviceId();
  }
  if (carrier === "both") {
    if (!shared) throw new ChoreValidationError("a private item is only mine");
    return carrier;
  }
  const partner = (await deps.pairs.activePair())?.deviceId ?? null;
  if (!shared || partner === null) {
    throw new ChoreValidationError("there is no partner to carry it");
  }
  return partner;
}

/** A private item is always mine; a shared one waits for its entry. */
function carrierOf(
  item: StoredItem,
  entry: string | undefined,
  own: string | null,
): MentalLoadCarrier | null {
  if (entry !== undefined) return relative(entry, own);
  return item.shared ? null : "me";
}

/** Nothing to take over: it is mine, or nobody is known to carry it. */
const isOwn = (carrier: MentalLoadCarrier | null) =>
  carrier === null || carrier === "me";

async function carrierEntries(carriers: CarrierRepository) {
  return (await carriers.list()).map((entry): SplitEntry => ({
    itemId: entry.itemId,
    carrierId: entry.carrier,
    hlc: parseHlc(entry.changedAt),
  }));
}

function splitReaders(deps: Deps) {
  const splitData = async () => ({
    entries: await carrierEntries(deps.carriers),
    items: await deps.items.list(),
    own: await deps.identity.deviceId(),
  });
  return {
    split: async () => {
      const { items, entries, own } = await splitData();
      return mentalLoadSplit(currentLoad(items, entries, own));
    },
    trend: async () => {
      const { items, entries, own } = await splitData();
      return mentalLoadTrend(
        weekInputs(items, entries, own, deps.clock.nowMs()),
      );
    },
  };
}

export function createHeadService(deps: Deps): HeadService {
  const { items, carriers } = deps;
  const list = async () => {
    const own = await deps.identity.deviceId();
    const latest = currentCarriers(await carrierEntries(carriers));
    return (await items.list()).map((item) => {
      const carrier = latest.get(item.id);
      return { ...item, carrier: carrierOf(item, carrier, own) };
    });
  };
  return {
    ...splitReaders(deps),
    subscribe: (listener) => {
      const stops = [items.subscribe(listener), carriers.subscribe(listener)];
      return () => {
        for (const stop of stops) stop();
      };
    },
    list,
    add: async (input, options) => {
      const { carrier = "me", ...rest } = input;
      const paired = (await deps.pairs.activePair()) !== null;
      const shared = paired && options?.private !== true;
      const stored = await absolute(deps, carrier, shared);
      const item = await items.add(rest, options);
      if (stored !== null) {
        await carriers.append({ itemId: item.id, carrier: stored, shared });
      }
      return { ...item, carrier };
    },
    takeOver: async (itemId) => {
      const item = (await list()).find(({ id }) => id === itemId);
      if (item === undefined) throw new ChoreValidationError("unknown item");
      if (item.status !== "open" || !item.shared || isOwn(item.carrier)) {
        throw new ChoreValidationError("this item cannot be taken over");
      }
      await carriers.append({
        itemId,
        carrier: await ownDevice(deps),
        shared: true,
      });
    },
  };
}
