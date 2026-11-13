import {
  currentCheckinWindow,
  type CheckinWindow,
  type Clock,
  type IsoWeek,
} from "@parapka/domain";
import type { ContentChange } from "@parapka/protocol";

import type { LocalDatabase } from "../data/local-database";
import type { KeyRepository } from "./key-repository";
import { toLocalDateTime } from "./local-time";
import { weekOfCheckinId } from "./record-store";
import type { ScheduleRepository } from "./schedule-repository";
import type { SealedRepository } from "./sealed-repository";

const REVEALED = "checkin-revealed";

/** The window that the clock and the schedule give now. */
export const currentWindowOf = async (
  clock: Clock,
  schedule: Pick<ScheduleRepository, "get">,
): Promise<CheckinWindow> =>
  currentCheckinWindow(toLocalDateTime(clock.nowMs()), await schedule.get());

/** The week of the check-in that a change names, or null for none. */
export const weekOfChange = (change: ContentChange): IsoWeek | null => {
  if (change.op !== "upsert") return null;
  const checkinId = Object.hasOwn(change.fields, "checkinId")
    ? change.fields["checkinId"]?.value
    : undefined;
  return typeof checkinId === "string" ? weekOfCheckinId(checkinId) : null;
};

export interface WindowEnd {
  /**
   * True when the week is over, was not revealed and this phone sent no key
   * for it: the data of the partner for it must not be kept (spec 7.4 point 5).
   */
  closed(week: IsoWeek): Promise<boolean>;
  /** Removes what the partner sent for the weeks that are closed. */
  sweep(): Promise<void>;
}

interface Deps {
  clock: Clock;
  schedule: Pick<ScheduleRepository, "get">;
  database: LocalDatabase;
  keys: Pick<
    KeyRepository,
    "weeks" | "ownSent" | "dropReceived" | "dropUnsent"
  >;
  sealed: Pick<SealedRepository, "weeks" | "dropReceived">;
}

/** The clean-up after the end of the window of a check-in (FR-CHK-06, A14). */
export function createWindowEnd(deps: Deps): WindowEnd {
  const { clock, schedule, database, keys, sealed } = deps;
  const closed = async (week: IsoWeek) => {
    const { week: now } = await currentWindowOf(clock, schedule);
    if (now <= week) return false;
    if ((await database.get(REVEALED, week)) !== null) return false;
    return !(await keys.ownSent(week));
  };
  return {
    closed,
    sweep: async () => {
      const weeks = new Set([
        ...(await sealed.weeks()),
        ...(await keys.weeks()),
      ]);
      for (const week of weeks) {
        if (!(await closed(week))) continue;
        await sealed.dropReceived(week);
        await keys.dropReceived(week);
        await keys.dropUnsent(week);
      }
    },
  };
}
