import type { ChoreRepository, StoredChore } from "../chores/chore-repository";
import type { CompletionRepository } from "../chores/completion-repository";
import type { ConsentRepository } from "../consent/consent-repository";
import type { LocalDatabase } from "../data/local-database";
import type { CarrierRepository } from "../head/carrier-repository";
import type { ItemRepository, StoredItem } from "../head/item-repository";
import type { PairRepository } from "../pairing/pair-repository";

const COLLECTION = "share-private";
const ID = "state";

/** The private chores and things to remember that the person may hand over. */
export interface PrivateCandidates {
  readonly chores: readonly StoredChore[];
  readonly items: readonly StoredItem[];
}

export interface SharePrivateService {
  /**
   * What to ask about (FR-PAIR-04), or null when the question is not due: no
   * confirmed pair, no consent yet, it was answered already, or there is
   * nothing private in a category the person shares.
   */
  candidates(): Promise<PrivateCandidates | null>;
  /**
   * Hands the picked chores and things over to the partner, with their
   * check-offs and carrier entries, and ends the question. Ids that are not
   * private candidates are ignored.
   */
  share(choreIds: readonly string[], itemIds: readonly string[]): Promise<void>;
  /** Ends the question; every record stays private. */
  skip(): Promise<void>;
}

interface Deps {
  database: LocalDatabase;
  pairs: Pick<PairRepository, "activePair">;
  consent: Pick<ConsentRepository, "canSync" | "isShared">;
  chores: Pick<ChoreRepository, "list" | "sync">;
  completions: Pick<CompletionRepository, "sync">;
  items: Pick<ItemRepository, "list" | "sync">;
  carriers: Pick<CarrierRepository, "sync">;
}

/** The part of a record id before the first `|`: the id of the chore or item. */
const ownerOf = (id: string) => id.split("|", 1).join("");

export function createSharePrivateService(deps: Deps): SharePrivateService {
  const { database, consent } = deps;
  const isDone = async () => (await database.get(COLLECTION, ID)) !== null;
  const finish = () => database.put(COLLECTION, ID, { done: true });
  // Only the categories the person shares are offered.
  const privateOnes = async () => ({
    chores: (await consent.isShared("SHARED_CHORES"))
      ? (await deps.chores.list()).filter(({ shared }) => !shared)
      : [],
    items: (await consent.isShared("SHARED_MENTAL_LOAD"))
      ? (await deps.items.list()).filter(({ shared }) => !shared)
      : [],
  });
  return {
    candidates: async () => {
      if ((await deps.pairs.activePair()) === null) return null;
      if (!(await consent.canSync()) || (await isDone())) return null;
      const found = await privateOnes();
      return found.chores.length + found.items.length === 0 ? null : found;
    },
    share: async (choreIds, itemIds) => {
      const found = await privateOnes();
      const chores = new Set(
        found.chores.map(({ id }) => id).filter((id) => choreIds.includes(id)),
      );
      const items = new Set(
        found.items.map(({ id }) => id).filter((id) => itemIds.includes(id)),
      );
      await deps.chores.sync.share((id) => chores.has(id));
      await deps.completions.sync.share((id) => chores.has(ownerOf(id)));
      await deps.items.sync.share((id) => items.has(id));
      await deps.carriers.sync.share((id) => items.has(ownerOf(id)));
      await finish();
    },
    skip: finish,
  };
}
