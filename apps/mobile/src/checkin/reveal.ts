import { unsealCheckin, type Sodium } from "@parapka/crypto";
import {
  createCheckinAnswers,
  type CheckinAnswers,
  type IsoWeek,
} from "@parapka/domain";

import { changeChannel } from "../data/change-listeners";
import type { JsonValue, LocalDatabase } from "../data/local-database";
import { base64Decode } from "../sync/base64";
import type { KeyRecord } from "./key-codec";
import type { KeyRepository } from "./key-repository";
import type { PartnerSealed, SealedRepository } from "./sealed-repository";

export const REVEALED_COLLECTION = "checkin-revealed";

export interface Reveal {
  /**
   * Locks the weeks where both versions are here, queues the own key of each
   * and opens the version of the partner for which his key is here.
   */
  settle(): Promise<void>;
  /** The revealed answers of the partner for the week, or null. */
  get(week: IsoWeek): Promise<CheckinAnswers | null>;
  subscribe(listener: () => void): () => void;
  /** Removes the revealed answers of the partner. */
  forgetReceived(): Promise<void>;
}

interface Deps {
  database: LocalDatabase;
  sodium: Sodium;
  sealed: Pick<SealedRepository, "weeks" | "latestOwn" | "partnerVersions">;
  keys: Pick<KeyRepository, "addOwn" | "partnerKey">;
}

/** The answers in the version, or null when the key or the data are wrong. */
function open(
  sodium: Sodium,
  { key }: KeyRecord,
  partner: PartnerSealed,
): CheckinAnswers | null {
  try {
    const { checkinId, authorId, version } = partner;
    const plain = unsealCheckin(
      sodium,
      base64Decode(key),
      { checkinId, authorId, version },
      partner,
    );
    return createCheckinAnswers(
      JSON.parse(new TextDecoder().decode(plain)) as CheckinAnswers,
    );
  } catch {
    return null;
  }
}

/** The lock and the reveal of the check-ins (FR-CHK-04, spec 7.4 point 3). */
export function createReveal(deps: Deps): Reveal {
  const { database, sodium, sealed, keys } = deps;
  const changes = changeChannel(database, REVEALED_COLLECTION);
  const get = async (week: IsoWeek) => {
    const row = (await database.get(REVEALED_COLLECTION, week)) as {
      answers: CheckinAnswers;
    } | null;
    return row?.answers ?? null;
  };
  const settleWeek = async (week: IsoWeek) => {
    const [own, versions] = [
      await sealed.latestOwn(week),
      await sealed.partnerVersions(week),
    ];
    if (own === null || versions.length === 0) return;
    await keys.addOwn(own.checkinId, own.version, own.sealKey);
    if ((await get(week)) !== null) return;
    for (const partner of versions) {
      const theirs = await keys.partnerKey(partner.checkinId, partner.version);
      const answers = theirs && open(sodium, theirs, partner);
      if (!answers) continue;
      await database.put(REVEALED_COLLECTION, week, {
        week,
        answers,
      } as unknown as JsonValue);
      changes.notify();
      return;
    }
  };
  return {
    subscribe: changes.subscribe,
    settle: async () => {
      for (const week of await sealed.weeks()) await settleWeek(week);
    },
    get,
    forgetReceived: async () => {
      for (const { id } of await database.list(REVEALED_COLLECTION)) {
        await database.delete(REVEALED_COLLECTION, id);
      }
      changes.notify();
    },
  };
}
