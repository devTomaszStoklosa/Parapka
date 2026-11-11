import type { SyncHandler } from "../sync/handler-registry";
import { createChoreHandler } from "./chore-handler";
import type { CompletionRepository } from "./completion-repository";

/**
 * Sync of the check-offs (FR-CHR-03): only those of the shared chores, with
 * SHARED_CHORES. It moves like the chores do, under its own entity name.
 */
export function createChoreCompletionHandler(deps: {
  completions: Pick<CompletionRepository, "sync">;
}): SyncHandler {
  const { sync } = deps.completions;
  return {
    ...createChoreHandler({
      chores: { sync },
    }),
    entity: "ChoreCompletion",
  };
}
