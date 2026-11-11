import { changeChannel } from "./change-listeners";
import type { JsonValue, LocalDatabase } from "./local-database";
import type { Profile } from "./profile";

const COLLECTION = "profile";
const ID = "me";

export interface ProfileRepository {
  /** The saved profile, or null before onboarding is done. */
  get(): Promise<Profile | null>;
  save(profile: Profile): Promise<void>;
  /** Calls the listener after every save; returns the unsubscribe. */
  subscribe(listener: () => void): () => void;
}

export function createProfileRepository(db: LocalDatabase): ProfileRepository {
  const changes = changeChannel(db, COLLECTION);
  return {
    subscribe: changes.subscribe,
    get: async () => {
      const value = await db.get(COLLECTION, ID);
      return value === null ? null : (value as unknown as Profile);
    },
    save: async (profile) => {
      await db.put(COLLECTION, ID, profile as unknown as JsonValue);
      changes.notify();
    },
  };
}
