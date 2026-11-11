import type { LocalDatabase } from "../data/local-database";
import { RelayError } from "../net/relay-error";
import type { SyncEngine } from "../sync/sync-engine";
import type { SyncTransport } from "../sync/transport";
import { clearPairLocally, type ClearPairDeps } from "./clear-pair";
import type { PairRepository } from "./pair-repository";

const CLOSING = { collection: "pair-closing", id: "current" };

export interface FinishClosingDeps {
  readonly database: LocalDatabase;
  readonly engine: Pick<SyncEngine, "flush">;
  /** The transport of the mailbox of the pair that is being closed. */
  readonly createTransport: (pairMailboxId: string) => SyncTransport;
}

export interface DisconnectDeps extends FinishClosingDeps {
  readonly pairs: Pick<PairRepository, "activePair">;
  readonly engine: Pick<SyncEngine, "flush" | "queueCommand">;
  readonly clearPair: ClearPairDeps;
  /** Stops the schedule of synchronization. */
  readonly stopScheduler: () => void;
}

/**
 * Sends the queue and closes the mailbox, then removes the marker. A network
 * error keeps the marker and the queue for a later try; `forbidden` and
 * `expired` mean the relay has nothing more to close.
 */
export async function finishClosing(deps: FinishClosingDeps): Promise<void> {
  const { database } = deps;
  const marker = await database.get(CLOSING.collection, CLOSING.id);
  if (marker === null) return;
  const transport = deps.createTransport(
    (marker as { pairMailboxId: string }).pairMailboxId,
  );
  try {
    await deps.engine.flush(transport);
    await transport.close();
  } catch (error) {
    const over =
      error instanceof RelayError &&
      (error.kind === "forbidden" || error.kind === "expired");
    if (!over) return;
  }
  await database.delete(CLOSING.collection, CLOSING.id);
}

/**
 * Ends the pair on the initiative of this person (FR-PAIR-07): queues the
 * command, marks the closing, cleans the device and then tries the network.
 */
export async function disconnect(deps: DisconnectDeps): Promise<void> {
  const pair = await deps.pairs.activePair();
  if (pair === null) return;
  deps.stopScheduler();
  await deps.engine.queueCommand((stamp) => ({
    entity: "Pair",
    id: "pair",
    op: "upsert",
    fields: { command: { value: "disconnect", hlc: stamp() } },
  }));
  await deps.database.put(CLOSING.collection, CLOSING.id, {
    pairMailboxId: pair.pairMailboxId,
  });
  await clearPairLocally(deps.clearPair);
  await finishClosing(deps);
}
