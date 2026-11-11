import type { Clock } from "@parapka/domain";

import type { JsonValue, LocalDatabase } from "../data/local-database";
import type { ProfileRepository } from "../data/profile-repository";
import {
  CONSENT_TEXT_VERSION,
  type ConsentCategory,
  type ConsentStates,
} from "./consent-model";

const COLLECTION = "consent";
const ID = "current";

/** The consent as saved on this device (FR-PAIR-03). */
export interface ConsentRecord {
  readonly states: ConsentStates;
  readonly savedAtMs: number;
  readonly textVersion: number;
}

export interface ConsentChange {
  readonly category: ConsentCategory;
  readonly enabled: boolean;
}

export interface ConsentRepository {
  /** The saved consent, or null before the person gave it. */
  current(): Promise<ConsentRecord | null>;
  /** Saves the first consent, with the date and the version of the text. */
  save(states: ConsentStates): Promise<void>;
  /** Changes one category and tells the listeners; needs a saved consent. */
  setCategory(category: ConsentCategory, enabled: boolean): Promise<void>;
  /** Removes the saved consent; synchronization cannot start again. */
  clear(): Promise<void>;
  /** Whether the data of the category may be sent and accepted; false without a consent. */
  isShared(category: ConsentCategory): Promise<boolean>;
  /** Synchronization starts only after the consent is saved. */
  canSync(): Promise<boolean>;
  /** Listens to the first consent being saved; returns the function that stops it. */
  onSaved(listener: () => void): () => void;
  /** Listens to changes of a category; returns the function that stops it. */
  onChange(listener: (change: ConsentChange) => void): () => void;
}

export function createConsentRepository(deps: {
  database: LocalDatabase;
  clock: Clock;
  profiles: Pick<ProfileRepository, "get">;
}): ConsentRepository {
  const { database, clock, profiles } = deps;
  const listeners = new Set<(change: ConsentChange) => void>();
  const savedListeners = new Set<() => void>();
  const subscribe = <L>(set: Set<L>, listener: L) => {
    set.add(listener);
    return () => {
      set.delete(listener);
    };
  };
  const current = async () =>
    (await database.get(COLLECTION, ID)) as ConsentRecord | null;
  const write = (states: ConsentStates) => {
    const record: ConsentRecord = {
      states,
      savedAtMs: clock.nowMs(),
      textVersion: CONSENT_TEXT_VERSION,
    };
    return database.put(COLLECTION, ID, record as unknown as JsonValue);
  };
  return {
    current,
    save: async (states) => {
      await write(states);
      for (const listener of [...savedListeners]) listener();
    },
    setCategory: async (category, enabled) => {
      const record = await current();
      if (!record) throw new Error("There is no consent to change");
      if (record.states[category] === enabled) return;
      await write({ ...record.states, [category]: enabled });
      for (const listener of [...listeners]) listener({ category, enabled });
    },
    clear: () => database.delete(COLLECTION, ID),
    isShared: async (category) => {
      const record = await current();
      if (!record?.states[category]) return false;
      if (category !== "CYCLE_HINTS") return true;
      return (await profiles.get())?.cycle === "yes";
    },
    canSync: async () => (await current()) !== null,
    onSaved: (listener) => subscribe(savedListeners, listener),
    onChange: (listener) => subscribe(listeners, listener),
  };
}
