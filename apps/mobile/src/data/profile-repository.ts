import type { JsonValue, LocalDatabase } from "./local-database";
import type { Profile } from "./profile";

const COLLECTION = "profile";
const ID = "self";

export interface ProfileRepository {
  /** The saved profile, or null before the onboarding is finished. */
  get(): Promise<Profile | null>;
  save(profile: Profile): Promise<void>;
}

export function createProfileRepository(db: LocalDatabase): ProfileRepository {
  return {
    get: async () => {
      const value = await db.get(COLLECTION, ID);
      return value === null ? null : (value as unknown as Profile);
    },
    save: (profile) => db.put(COLLECTION, ID, profile as unknown as JsonValue),
  };
}
