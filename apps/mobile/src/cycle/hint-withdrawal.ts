import type { CalendarDate } from "@parapka/domain";
import type { ContentChange } from "@parapka/protocol";

import { changeHlc } from "../checkin/sealed-codec";
import type { ConsentRepository } from "../consent/consent-repository";
import type { LocalDatabase } from "../data/local-database";
import type { NextHlc, SyncHandler } from "../sync/handler-registry";
import type { PauseRepository } from "../sync/pause-repository";
import type { HintRepository } from "./hint-repository";
import type { ReceivedHintRepository } from "./received-hint-repository";

export const HINT_WITHDRAWAL_ENTITY = "HintWithdrawal";
const ID = "hints";
const COLLECTION = "hint-withdrawal";
const MARKER = "state";
const ALL = "all";
const DATE = /^\d{4}-\d{2}-\d{2}$/;

/** What the partner sees of the own hints: sent, held back, or taken back. */
type State = "shared" | "paused" | "withdrawn";

interface Deps {
  database: LocalDatabase;
  today: () => CalendarDate;
  consent: Pick<ConsentRepository, "isShared">;
  pause: Pick<PauseRepository, "isPaused">;
  hints: Pick<HintRepository, "resendFrom">;
  received: Pick<ReceivedHintRepository, "forgetSent">;
}

/** The scope of a command, `all` or the first date, when its value is valid. */
function scopeOf(change: ContentChange): CalendarDate | null | undefined {
  if (change.op !== "upsert") return undefined;
  const value = change.fields.from?.value;
  if (value === ALL) return null;
  return typeof value === "string" && DATE.test(value) ? value : undefined;
}

/**
 * Takes back the own hints from the phone of the partner (FR-PAIR-05,
 * FR-PAIR-06, FR-CYC-13). The marker keeps the state the partner can see.
 * A pause sends one command "remove from today", turning CYCLE_HINTS off one
 * command "remove all"; the command says neither why nor anything of the
 * cycle. It has no category, so it goes whatever the consent and the pause
 * say. The marker moves to the new state only after the envelope is saved
 * (`committed`), so an interrupted save loses no command. When the hints
 * return, the own hints of today and later are sent anew.
 */
export function createHintWithdrawalHandler(deps: Deps): SyncHandler {
  const { database, today, consent, pause, hints, received } = deps;
  let target: State | null = null;
  const desired = async (): Promise<State> => {
    if (!(await consent.isShared("CYCLE_HINTS"))) return "withdrawn";
    return (await pause.isPaused()) ? "paused" : "shared";
  };
  return {
    entity: HINT_WITHDRAWAL_ENTITY,
    category: null,
    collect: async (nextHlc: NextHlc) => {
      target = null;
      const now = await desired();
      const was = (await database.get(COLLECTION, MARKER)) as State | null;
      if (was === now) return [];
      const command =
        now === "withdrawn" ? ALL : now === "paused" ? today() : null;
      // Nothing was sent when the marker is empty, and a command is only for
      // a state that the partner sees as shared.
      if (was === null || was === "withdrawn" || command === null) {
        if (now === "shared" && was !== null) await hints.resendFrom(today());
        await database.put(COLLECTION, MARKER, now);
        return [];
      }
      target = now;
      return [
        {
          entity: HINT_WITHDRAWAL_ENTITY,
          id: ID,
          op: "upsert",
          fields: { from: { value: command, hlc: nextHlc() } },
        },
      ];
    },
    committed: async () => {
      if (target === null) return;
      const state = target;
      target = null;
      await database.put(COLLECTION, MARKER, state);
    },
    forgetReceived: async () => {
      target = null;
      await database.delete(COLLECTION, MARKER);
    },
    apply: async (change: ContentChange) => {
      const from = scopeOf(change);
      if (from === undefined || change.op !== "upsert") return;
      await received.forgetSent(from, changeHlc(change));
    },
  };
}
