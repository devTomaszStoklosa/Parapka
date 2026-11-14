import {
  HINT_HISTORY_DAYS,
  type CalendarDate,
  type HintCategory,
} from "@parapka/domain";
import type { ContentChange } from "@parapka/protocol";
import {
  applyChange,
  emptyEntityState,
  entityValues,
  type EntityState,
} from "@parapka/sync";

import { changeChannel } from "../data/change-listeners";
import type { JsonValue, LocalDatabase } from "../data/local-database";
import { ENTITY, sanitize, validHint, type SentHint } from "./hint-codec";
import { addDays, HINTS } from "./hint-repository";

export const RECEIVED = "cycle-hints-received";

/** A hint of the partner: only what the partner sent (FR-CYC-09). */
export interface ReceivedHint extends SentHint {
  readonly id: string;
  readonly category: HintCategory;
}

export interface ReceivedHintRepository {
  /** The hint for the day of this phone, or null. */
  today(): Promise<ReceivedHint | null>;
  /** The hints of the last 14 days before today, the newest first. */
  history(): Promise<ReceivedHint[]>;
  subscribe(listener: () => void): () => void;
  /** Removes every received hint (the pair is over). */
  forgetReceived(): Promise<void>;
  /**
   * Removes the hints for the days from `from` (every day when null) whose
   * newest field is not later than `until`, the HLC of the command of the
   * partner; a hint sent after the command stays.
   */
  forgetSent(from: CalendarDate | null, until: string): Promise<void>;
  /** Takes in a change of the partner; an invalid one is skipped. */
  merge(change: ContentChange): Promise<void>;
}

interface ReceivedRecord {
  state: EntityState;
}

/** The stored hints and the removal of those older than 14 days. */
function createStore(database: LocalDatabase, today: () => CalendarDate) {
  const changes = changeChannel(database, RECEIVED);
  const all = async () => {
    const found = await database.list(RECEIVED);
    return found.map(({ id, value }) => ({
      id,
      hint: validHint(
        entityValues((value as unknown as ReceivedRecord).state) ?? {},
      ),
    }));
  };
  const prune = async () => {
    const from = addDays(today(), -HINT_HISTORY_DAYS);
    const old = (await all()).filter(
      ({ hint }) => (hint?.forDate ?? "") < from,
    );
    for (const { id } of old) await database.delete(RECEIVED, id);
    if (old.length > 0) changes.notify();
  };
  const list = async () => {
    await prune();
    return (await all()).flatMap(({ id, hint }) =>
      hint === null ? [] : [{ ...hint, id }],
    );
  };
  const forgetSent = async (from: CalendarDate | null, until: string) => {
    let removed = 0;
    for (const { id, value } of await database.list(RECEIVED)) {
      const { state } = value as unknown as ReceivedRecord;
      const forDate = validHint(entityValues(state) ?? {})?.forDate ?? "";
      const newest = Object.values(state.fields).map(({ hlc }) => hlc);
      // The text form of an HLC is ordered like the HLC.
      if (from !== null && forDate < from) continue;
      if (newest.some((hlc) => hlc > until)) continue;
      await database.delete(RECEIVED, id);
      removed += 1;
    }
    if (removed > 0) changes.notify();
  };
  return { changes, prune, list, forgetSent };
}

/**
 * The hints of the partner, in a collection of their own, read-only for the
 * app. The merge keeps the newer version of a day; hints older than 14 days
 * by the clock of this phone are removed.
 */
export function createReceivedHintRepository(deps: {
  database: LocalDatabase;
  today: () => CalendarDate;
}): ReceivedHintRepository {
  const { database } = deps;
  const { changes, prune, list, forgetSent } = createStore(
    database,
    deps.today,
  );
  return {
    subscribe: changes.subscribe,
    today: async () =>
      (await list()).find(({ forDate }) => forDate === deps.today()) ?? null,
    history: async () =>
      (await list())
        .filter(({ forDate }) => forDate < deps.today())
        .sort((a, b) => b.forDate.localeCompare(a.forDate)),
    forgetReceived: async () => {
      for (const { id } of await database.list(RECEIVED)) {
        await database.delete(RECEIVED, id);
      }
      changes.notify();
    },
    forgetSent,
    merge: async (change) => {
      // Only the generator of a hint changes it, never the partner.
      if ((await database.get(HINTS, change.id)) !== null) return;
      const incoming = sanitize(change);
      if (incoming === null) return;
      const known = (await database.get(
        RECEIVED,
        change.id,
      )) as unknown as ReceivedRecord | null;
      const state = applyChange(
        known?.state ?? emptyEntityState(ENTITY, change.id),
        incoming,
      );
      const record: ReceivedRecord = { state };
      await database.put(RECEIVED, change.id, record as unknown as JsonValue);
      changes.notify();
      await prune();
    },
  };
}
