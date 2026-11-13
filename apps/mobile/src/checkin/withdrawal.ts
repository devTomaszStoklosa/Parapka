import type { ContentChange } from "@parapka/protocol";

import type { ConsentRepository } from "../consent/consent-repository";
import type { LocalDatabase } from "../data/local-database";
import type { Clock } from "@parapka/domain";
import type { NextHlc, SyncHandler } from "../sync/handler-registry";
import type { KeyRepository } from "./key-repository";
import type { Reveal } from "./reveal";
import { changeHlc } from "./sealed-codec";
import type { SealedRepository } from "./sealed-repository";
import type { ScheduleRepository } from "./schedule-repository";
import { currentWindowOf } from "./window-sweep";

export const WITHDRAWAL_ENTITY = "CheckInWithdrawal";
const ID = "checkin";
const COLLECTION = "checkin-withdrawal";
const MARKER = "shared";

type Deps = Parameters<typeof createWithdrawalHandler>[0];

/** Removes what the partner sent, up to the HLC of the command. */
async function removeSent(
  { sealed, keys, reveal }: Pick<Deps, "sealed" | "keys" | "reveal">,
  change: ContentChange,
) {
  if (change.op !== "upsert") return;
  const until = changeHlc(change);
  await sealed.forgetReceived(until);
  await keys.forgetReceived(until);
  await reveal.forgetReceived();
  await reveal.settle();
}

/**
 * Takes back the shared check-in (FR-PAIR-05): when CHECKIN was on and is turned
 * off, one command goes to the partner, whose phone removes what this phone
 * sent. It has no category, so it goes whatever the consent and the pause say.
 * The marker says that the category was seen on; it moves only after the
 * envelope is saved (`committed`), so an interrupted save loses no command.
 * Turning the category on again sends the open week anew.
 */
export function createWithdrawalHandler(deps: {
  database: LocalDatabase;
  clock: Clock;
  schedule: Pick<ScheduleRepository, "get">;
  consent: Pick<ConsentRepository, "isShared">;
  sealed: Pick<SealedRepository, "forgetReceived" | "resendWeek">;
  keys: Pick<KeyRepository, "forgetReceived" | "resendWeek">;
  reveal: Pick<Reveal, "forgetReceived" | "settle">;
}): SyncHandler {
  const { database, clock, schedule, consent, sealed, keys, reveal } = deps;
  let collected = false;
  return {
    entity: WITHDRAWAL_ENTITY,
    category: null,
    collect: async (nextHlc: NextHlc) => {
      collected = false;
      if (await consent.isShared("CHECKIN")) {
        await database.put(COLLECTION, MARKER, true);
        return [];
      }
      if ((await database.get(COLLECTION, MARKER)) !== true) return [];
      collected = true;
      return [
        {
          entity: WITHDRAWAL_ENTITY,
          id: ID,
          op: "upsert",
          fields: { withdrawn: { value: true, hlc: nextHlc() } },
        },
      ];
    },
    committed: async () => {
      if (!collected) return;
      collected = false;
      await database.delete(COLLECTION, MARKER);
      const { week } = await currentWindowOf(clock, schedule);
      await sealed.resendWeek(week);
      await keys.resendWeek(week);
    },
    forgetReceived: async () => {
      collected = false;
      await database.delete(COLLECTION, MARKER);
    },
    apply: (change: ContentChange) =>
      removeSent({ sealed, keys, reveal }, change),
  };
}
