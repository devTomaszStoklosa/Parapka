import {
  ChoreValidationError,
  createMentalLoadItem,
  type MentalLoadCarrier,
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
  subscribe(listener: () => void): () => void;
}

interface Deps {
  items: ItemRepository;
  carriers: CarrierRepository;
  pairs: Pick<PairRepository, "activePair">;
  identity: Pick<Identity, "deviceId">;
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
  if (carrier === "me") return ownDevice(deps);
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

const relative = (carrier: string, own: string): MentalLoadCarrier => {
  if (carrier === "both") return carrier;
  return carrier === own ? "me" : "partner";
};

/** Nothing to take over: it is mine, or nobody is known to carry it. */
const isOwn = (carrier: MentalLoadCarrier | null) =>
  carrier === null || carrier === "me";

export function createHeadService(deps: Deps): HeadService {
  const { items, carriers } = deps;
  const list = async () => {
    const own = await ownDevice(deps);
    const latest = currentCarriers(
      (await carriers.list()).map((entry) => ({
        itemId: entry.itemId,
        carrierId: entry.carrier,
        hlc: parseHlc(entry.changedAt),
      })),
    );
    return (await items.list()).map((item) => {
      const carrier = latest.get(item.id);
      return {
        ...item,
        carrier: carrier === undefined ? null : relative(carrier, own),
      };
    });
  };
  return {
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
      await carriers.append({ itemId: item.id, carrier: stored, shared });
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
