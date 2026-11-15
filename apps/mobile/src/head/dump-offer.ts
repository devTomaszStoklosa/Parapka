import type { Clock } from "@parapka/domain";

import type { LocalDatabase } from "../data/local-database";
import type { PairRepository } from "../pairing/pair-repository";

const COLLECTION = "dump-offer";
const ID = "state";
const WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

interface Stored {
  pairMailboxId: string;
  firstSeenMs: number;
  dismissed: boolean;
}

export interface DumpOffer {
  /**
   * Whether to invite to the brain dump (FR-MNT-07): in a pair, for 7 days
   * from the first time this pair was seen, unless it was dismissed. The first
   * look at a pair starts its 7 days; the record never leaves the device.
   */
  due(): Promise<boolean>;
  /** Ends the invitation for the current pair. */
  dismiss(): Promise<void>;
}

interface Deps {
  database: LocalDatabase;
  pairs: Pick<PairRepository, "activePair">;
  clock: Clock;
}

export function createDumpOffer(deps: Deps): DumpOffer {
  const { database, clock } = deps;
  const currentPair = async () =>
    (await deps.pairs.activePair())?.pairMailboxId ?? null;
  const read = async (pairMailboxId: string) => {
    const stored = (await database.get(COLLECTION, ID)) as Stored | null;
    if (stored?.pairMailboxId === pairMailboxId) return stored;
    // A new pair starts its own 7 days.
    const fresh = {
      pairMailboxId,
      firstSeenMs: clock.nowMs(),
      dismissed: false,
    };
    await database.put(COLLECTION, ID, fresh);
    return fresh;
  };
  return {
    due: async () => {
      const pairMailboxId = await currentPair();
      if (pairMailboxId === null) return false;
      const { firstSeenMs, dismissed } = await read(pairMailboxId);
      return !dismissed && clock.nowMs() < firstSeenMs + WINDOW_MS;
    },
    dismiss: async () => {
      const pairMailboxId = await currentPair();
      if (pairMailboxId === null) return;
      const stored = await read(pairMailboxId);
      await database.put(COLLECTION, ID, { ...stored, dismissed: true });
    },
  };
}
