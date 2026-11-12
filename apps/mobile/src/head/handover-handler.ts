import type { SyncHandler } from "../sync/handler-registry";
import type { HandoverRepository } from "./handover-repository";
import { createItemHandler } from "./item-handler";

/**
 * Sync of the handover requests (FR-MNT-03): only those of the shared items,
 * with SHARED_MENTAL_LOAD. It moves like the items do, under its own entity.
 */
export function createHandoverHandler(deps: {
  handovers: Pick<HandoverRepository, "sync" | "subscribe">;
}): SyncHandler {
  const { sync, subscribe } = deps.handovers;
  return {
    ...createItemHandler({ items: { sync, subscribe } }),
    entity: "HandoverRequest",
  };
}
