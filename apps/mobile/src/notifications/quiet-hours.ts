import { toLocalDateTime } from "../checkin/local-time";

/** Quiet hours as local times `HH:MM`; `from === to` means no quiet hours. */
export interface QuietHours {
  readonly from: string;
  readonly to: string;
}

export const DEFAULT_QUIET_HOURS: QuietHours = { from: "22:00", to: "07:00" };

const minutesOf = (time: string): number => {
  const [hour = 0, minute = 0] = time.split(":").map(Number);
  return hour * 60 + minute;
};

/**
 * The moment itself, or the end of the quiet hours when it falls inside them
 * (FR-NOT-07). Works on the local calendar, so a change of the clock is safe.
 */
export function shiftOutOfQuietHours(
  atMs: number,
  quietHours: QuietHours,
): number {
  const from = minutesOf(quietHours.from);
  const to = minutesOf(quietHours.to);
  const at = toLocalDateTime(atMs);
  const now = at.hour * 60 + at.minute;
  const endOn = (dayOffset: number) =>
    new Date(
      at.year,
      at.month - 1,
      at.day + dayOffset,
      Math.floor(to / 60),
      to % 60,
    ).getTime();
  if (from === to) return atMs;
  if (from < to) return now >= from && now < to ? endOn(0) : atMs;
  if (now >= from) return endOn(1);
  return now < to ? endOn(0) : atMs;
}
