import type { ContentChange } from "@parapka/protocol";

import type { SyncHandler } from "./handler-registry";

const ENTITY = "Pair";
const COMMAND = "command";
const DISCONNECT = "disconnect";

/**
 * The entity `Pair` carries commands of the partner. For now there is one:
 * `disconnect` (FR-PAIR-07). Other commands and deletions are ignored.
 */
export function createPairHandler(deps: {
  /** Ends the pair on this device. */
  onDisconnect: () => Promise<void>;
}): SyncHandler {
  return {
    entity: ENTITY,
    category: null,
    collect: () => Promise.resolve([]),
    apply: async (change: ContentChange) => {
      if (change.op !== "upsert") return;
      if (change.fields[COMMAND]?.value !== DISCONNECT) return;
      await deps.onDisconnect();
    },
  };
}
