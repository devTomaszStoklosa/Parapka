import type { SyncHandler } from "../sync/handler-registry";
import type { CarrierRepository } from "./carrier-repository";
import { createItemHandler } from "./item-handler";

/**
 * Sync of the carrier entries (FR-MNT-02): only those of the shared items, with
 * SHARED_MENTAL_LOAD. It moves like the items do, under its own entity name.
 */
export function createCarrierHandler(deps: {
  carriers: Pick<CarrierRepository, "sync" | "subscribe">;
}): SyncHandler {
  const { sync, subscribe } = deps.carriers;
  return {
    ...createItemHandler({ items: { sync, subscribe } }),
    entity: "CarrierChange",
  };
}
