import type { CalendarDate } from "@parapka/domain";

import { localDate } from "../chores/planner-model";
import type { LocalDatabase } from "../data/local-database";

/** The collection of the research report: local only, with no sync handler (ZP-4). */
export const ACTIVITY_LOG = "activity-log";

/** Entries older than this many days are dropped on the next write. */
export const RETENTION_DAYS = 120;

const DAY_MS = 86_400_000;

export interface ActivityLog {
  /** Saves the local day of `nowMs`, at most once a day. */
  recordOpen(nowMs: number): Promise<void>;
  /** The days with an opening, oldest first. */
  days(): Promise<CalendarDate[]>;
}

/** The days on which the app was opened. They never leave the phone. */
export function createActivityLog(database: LocalDatabase): ActivityLog {
  return {
    recordOpen: async (nowMs) => {
      const today = localDate(nowMs);
      const oldest = localDate(nowMs - RETENTION_DAYS * DAY_MS);
      for (const { id } of await database.list(ACTIVITY_LOG)) {
        if (id < oldest) await database.delete(ACTIVITY_LOG, id);
      }
      if ((await database.get(ACTIVITY_LOG, today)) === null) {
        await database.put(ACTIVITY_LOG, today, { date: today });
      }
    },
    days: async () =>
      (await database.list(ACTIVITY_LOG)).map(({ id }) => id).sort(),
  };
}
