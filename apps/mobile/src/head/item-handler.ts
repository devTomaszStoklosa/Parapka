import type { ContentChange } from "@parapka/protocol";

import type { SyncHandler } from "../sync/handler-registry";
import type { ItemRepository } from "./item-repository";

/**
 * Sync of the things to remember (FR-MNT): only the shared ones, with
 * SHARED_MENTAL_LOAD. Pending changes are stamped when the engine collects and
 * move into the merged state once the envelope is saved (`committed`). A pair
 * that ends leaves the items here as private copies (FR-PAIR-07, A13).
 */
export function createItemHandler(deps: {
  items: Pick<ItemRepository, "sync" | "subscribe">;
}): SyncHandler {
  const { sync, subscribe } = deps.items;
  let collected: readonly ContentChange[] = [];
  return {
    entity: "MentalLoadItem",
    category: "SHARED_MENTAL_LOAD",
    collect: async (nextHlc) => {
      collected = await sync.collect(nextHlc);
      return collected;
    },
    committed: async () => {
      const sent = collected;
      collected = [];
      await sync.commit(sent);
    },
    apply: (change) => sync.merge(change),
    disconnected: () => sync.makePrivate(),
    subscribe,
  };
}
