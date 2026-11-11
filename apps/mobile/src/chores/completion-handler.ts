import type { ContentChange } from "@parapka/protocol";

import type { SyncHandler } from "../sync/handler-registry";
import type { CompletionRepository } from "./completion-repository";

/**
 * Sync of the check-offs (FR-CHR-03): only those of the shared chores, with
 * SHARED_CHORES. Like the chores, pending changes move into the merged state
 * once the envelope is saved, and a pair that ends leaves private copies.
 */
export function createChoreCompletionHandler(deps: {
  completions: Pick<CompletionRepository, "sync">;
}): SyncHandler {
  const { sync } = deps.completions;
  let collected: readonly ContentChange[] = [];
  return {
    entity: "ChoreCompletion",
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
  };
}
