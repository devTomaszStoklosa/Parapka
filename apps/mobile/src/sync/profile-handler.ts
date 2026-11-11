import type { ContentChange } from "@parapka/protocol";
import { compareHlc, parseHlc } from "@parapka/sync";

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
const HELD = "held-goals";

// What the partner takes back when ONBOARDING_GOALS is turned off.
const GOAL_FIELDS = ["goals", "otherGoalText"];

type Fields = Record<string, unknown>;

/** The fields that differ from what was last put in the queue, stamped. */
function stampChanged(current: Fields, sent: Fields, nextHlc: NextHlc) {
  const fields: Record<string, StampedField> = {};
  for (const [name, value] of Object.entries(current)) {
    if (JSON.stringify(sent[name]) === JSON.stringify(value)) continue;
    fields[name] = { value, hlc: nextHlc() };
  }
  return fields;
}

/**
 * What goes to the queue: the changed fields, plus a null for the goal fields
 * that were sent earlier and are not sent now. The marker drops those, so
 * turning the category on again sends them anew.
 */
function diffProfile(current: Fields, sent: Fields, nextHlc: NextHlc) {
  const fields = stampChanged(current, sent, nextHlc);
  const withdrawn = GOAL_FIELDS.some((n) => n in sent && !(n in current));
  const marker = { ...sent, ...current };
  for (const name of withdrawn ? GOAL_FIELDS : []) {
    fields[name] = { value: null, hlc: nextHlc() };
    Reflect.deleteProperty(marker, name);
  }
  return Object.keys(fields).length === 0 ? null : { fields, marker };
}

/** Goals that arrived while the category was off, kept unseen until it is on. */
function createHeldGoals(
  database: LocalDatabase,
  partner: PartnerProfileRepository,
) {
  const read = () =>
    database.get(COLLECTION, HELD) as Promise<StampedField | null>;
  return {
    hold: async (field: StampedField) => {
      const known = await read();
      if (known && compareHlc(parseHlc(field.hlc), parseHlc(known.hlc)) <= 0) {
        return;
      }
      await database.put(COLLECTION, HELD, field as unknown as JsonValue);
    },
    release: async () => {
      const known = await read();
      if (known === null) return;
      await partner.merge({ goals: known });
      await database.delete(COLLECTION, HELD);
    },
  };
}

/**
 * Sync of the profile (FR-PAIR-03): the name and form always, the goals only
 * while ONBOARDING_GOALS is shared. The marker keeps what was last put in the
 * queue; it moves only after the envelope is saved (`committed`), so an
 * interrupted save loses no change. Goals that arrive while the category is
 * off here are held aside, unseen, and taken in when the category is turned on,
 * as the sender will not send them again.
 */
export function createProfileHandler(deps: {
  database: LocalDatabase;
  profiles: Pick<ProfileRepository, "get">;
  partner: PartnerProfileRepository;
  consent: Pick<ConsentRepository, "isShared" | "onChange">;
}): SyncHandler {
  const { database, profiles, partner, consent } = deps;
  let collected: Fields | null = null;
  const held = createHeldGoals(database, partner);
  consent.onChange(({ category, enabled }) => {
    if (category === "ONBOARDING_GOALS" && enabled) void held.release();
  });
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
      const diff = diffProfile(current, sent, nextHlc);
      if (diff === null) return [];
      collected = diff.marker;
      return [{ entity: ENTITY, id: ID, op: "upsert", fields: diff.fields }];
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
        if (!isPartnerField(name)) continue;
        if (name === "goals" && !goalsShared) {
          await held.hold(field);
          continue;
        }
        fields[name] = field;
      }
      await partner.merge(fields);
    },
  };
}
