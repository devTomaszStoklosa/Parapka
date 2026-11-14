import { changeChannel } from "../data/change-listeners";
import type { LocalDatabase } from "../data/local-database";

/** The collection of the reactions: local only, with no sync handler (ZP-2). */
export const HINT_REACTIONS = "hint-reactions";

export const REACTIONS = ["done", "notToday"] as const;
export type HintReaction = (typeof REACTIONS)[number];

export interface HintReactionRepository {
  get(hintId: string): Promise<HintReaction | null>;
  /** The reactions of the given hints; a hint without one is missing. */
  getMany(hintIds: readonly string[]): Promise<Record<string, HintReaction>>;
  /** Keeps the reaction on this phone only; a later one replaces it. */
  set(hintId: string, reaction: HintReaction): Promise<void>;
  subscribe(listener: () => void): () => void;
}

const valid = (value: unknown): HintReaction | null =>
  REACTIONS.find((reaction) => reaction === value) ?? null;

/** The reactions of this person to the hints of the partner. They never leave the phone. */
export function createHintReactionRepository(
  database: LocalDatabase,
): HintReactionRepository {
  const changes = changeChannel(database, HINT_REACTIONS);
  const get = async (hintId: string) => {
    const stored = await database.get(HINT_REACTIONS, hintId);
    return valid((stored as { reaction?: unknown } | null)?.reaction);
  };
  return {
    get,
    getMany: async (hintIds) => {
      const found: Record<string, HintReaction> = {};
      for (const hintId of hintIds) {
        const reaction = await get(hintId);
        if (reaction !== null) found[hintId] = reaction;
      }
      return found;
    },
    set: async (hintId, reaction) => {
      await database.put(HINT_REACTIONS, hintId, { reaction });
      changes.notify();
    },
    subscribe: changes.subscribe,
  };
}
