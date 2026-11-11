import type { ContentChange } from "@parapka/protocol";

import type { SyncHandler } from "../sync/handler-registry";
import type { ChoreRepository } from "./chore-repository";

/**
 * Sync of the chores (FR-CHR-01, FR-CHR-06): only the shared ones, with
 * SHARED_CHORES. Pending changes are stamped when the engine collects and move
 * into the merged state once the envelope is saved (`committed`), so an
 * interrupted save loses nothing. A pair that ends leaves the chores here as
 * private copies (FR-PAIR-07, A13).
 */
export function createChoreHandler(deps: {
  chores: Pick<ChoreRepository, "sync" | "subscribe">;
}): SyncHandler {
  const { sync, subscribe } = deps.chores;
  let collected: readonly ContentChange[] = [];
  return {
    entity: "Chore",
    category: "SHARED_CHORES",
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
