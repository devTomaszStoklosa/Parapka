import type { ContentChange } from "@parapka/protocol";

import type { ConsentRepository } from "../consent/consent-repository";
import type { JsonValue, LocalDatabase } from "../data/local-database";
import type { ProfileRepository } from "../data/profile-repository";
import type { NextHlc, SyncHandler } from "./handler-registry";
import {
  isPartnerField,
  profileFields,
  type PartnerProfileRepository,
  type StampedField,
} from "./partner-profile-repository";

const ENTITY = "Profile";
const ID = "profile";
const COLLECTION = "sync-profile";
const MARKER = "collected";

type Fields = Record<string, unknown>;

/**
 * Sync of the profile (FR-PAIR-03): the name and form always, the goals only
 * while ONBOARDING_GOALS is shared. The marker keeps what was last put in the
 * queue; it moves only after the envelope is saved (`committed`), so an
 * interrupted save loses no change.
 */
export function createProfileHandler(deps: {
  database: LocalDatabase;
  profiles: Pick<ProfileRepository, "get">;
  partner: PartnerProfileRepository;
  consent: Pick<ConsentRepository, "isShared">;
}): SyncHandler {
  const { database, profiles, partner, consent } = deps;
  let collected: Fields | null = null;
  return {
    entity: ENTITY,
    category: null,
    collect: async (nextHlc: NextHlc) => {
      collected = null;
      const profile = await profiles.get();
      if (profile === null) return [];
      const current = profileFields(
        profile,
        await consent.isShared("ONBOARDING_GOALS"),
      );
      const sent = ((await database.get(COLLECTION, MARKER)) ?? {}) as Fields;
      const fields: Record<string, StampedField> = {};
      for (const [name, value] of Object.entries(current)) {
        if (JSON.stringify(sent[name]) === JSON.stringify(value)) continue;
        fields[name] = { value, hlc: nextHlc() };
      }
      if (Object.keys(fields).length === 0) return [];
      collected = { ...sent, ...current };
      return [{ entity: ENTITY, id: ID, op: "upsert", fields }];
    },
    committed: async () => {
      if (collected === null) return;
      await database.put(COLLECTION, MARKER, collected as JsonValue);
      collected = null;
    },
    apply: async (change: ContentChange) => {
      if (change.op !== "upsert") return;
      const fields: Record<string, StampedField> = {};
      const goalsShared = await consent.isShared("ONBOARDING_GOALS");
      for (const [name, field] of Object.entries(change.fields)) {
        if (!isPartnerField(name) || (name === "goals" && !goalsShared)) {
          continue;
        }
        fields[name] = field;
      }
      await partner.merge(fields);
    },
  };
}
