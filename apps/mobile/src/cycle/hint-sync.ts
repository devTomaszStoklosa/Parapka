import type { SyncHandler } from "../sync/handler-registry";
import { createRecordHandler } from "../sync/record-handler";
import { ENTITY } from "./hint-codec";
import type { HintRepository } from "./hint-repository";
import type { ReceivedHintRepository } from "./received-hint-repository";

/**
 * One-way sync of the own hints (FR-CYC-06, FR-CYC-14): they leave with
 * CYCLE_HINTS of the sender and are taken in by the partner whatever the
 * partner's own consent is (`receiveCategory: null`). The hints of the
 * partner go to their own collection, never to the own hints.
 */
export function createHintHandler(deps: {
  hints: Pick<HintRepository, "sync" | "subscribe">;
  received: Pick<ReceivedHintRepository, "merge" | "forgetReceived">;
}): SyncHandler {
  const { hints, received } = deps;
  return createRecordHandler({
    entity: ENTITY,
    category: "CYCLE_HINTS",
    receiveCategory: null,
    sync: { ...hints.sync, merge: (change) => received.merge(change) },
    subscribe: hints.subscribe,
    forget: () => received.forgetReceived(),
  });
}
