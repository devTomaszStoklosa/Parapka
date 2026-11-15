import type { ConsentRepository } from "../consent/consent-repository";
import { changeChannel } from "../data/change-listeners";
import {
  createCycleSettingsRepository,
  type CycleSettings,
} from "../data/cycle-settings";
import type { LocalDatabase } from "../data/local-database";
import type { ProfileRepository } from "../data/profile-repository";
import { PERIODS } from "./cycle-repository";
import { HINT_FEEDBACK } from "./hint-feedback-repository";
import { HINTS } from "./hint-repository";
import { WELLBEING } from "./wellbeing-repository";

export interface CyclePanel {
  /** Saves the settings, then turns the panel on (FR-ONB-03). */
  enable(settings: CycleSettings): Promise<void>;
  /**
   * Turns the panel off and removes the cycle data and the own hints from
   * this phone (FR-CYC-13). The profile changes last, so after a failure the
   * panel stays on and a new try finishes the cleanup.
   */
  disable(): Promise<void>;
}

// The data of the person, with the channel that tells the screens about it.
// The hints received from the partner stay (FR-CYC-14).
const OWN_DATA: readonly [collection: string, channel: string][] = [
  [PERIODS, "cycle"],
  [WELLBEING, "wellbeing"],
  [HINTS, HINTS],
  [HINT_FEEDBACK, HINT_FEEDBACK],
];

async function clearCollection(database: LocalDatabase, collection: string) {
  for (const { id } of await database.list(collection)) {
    await database.delete(collection, id);
  }
}

export function createCyclePanel(deps: {
  database: LocalDatabase;
  profiles: Pick<ProfileRepository, "get" | "save">;
  consent: Pick<ConsentRepository, "current" | "setCategory">;
}): CyclePanel {
  const { database, profiles, consent } = deps;
  const settings = createCycleSettingsRepository(database);
  const setCycle = async (cycle: "yes" | "no") => {
    const profile = await profiles.get();
    if (!profile) throw new Error("There is no profile");
    await profiles.save({ ...profile, cycle });
  };
  return {
    enable: async (value) => {
      await settings.save(value);
      await setCycle("yes");
    },
    disable: async () => {
      await settings.clear();
      for (const [collection, channel] of OWN_DATA) {
        await clearCollection(database, collection);
        changeChannel(database, channel).notify();
      }
      // The consent stays off, so turning the panel on again does not resume
      // the sharing without a decision of the person.
      if (await consent.current()) {
        await consent.setCategory("CYCLE_HINTS", false);
      }
      await setCycle("no");
    },
  };
}
