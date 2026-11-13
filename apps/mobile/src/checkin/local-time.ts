import type { LocalDateTime } from "@parapka/domain";

/** The local calendar date and time of a moment, from the local getters. */
export function toLocalDateTime(ms: number): LocalDateTime {
  const d = new Date(ms);
  return {
    year: d.getFullYear(),
    month: d.getMonth() + 1,
    day: d.getDate(),
    hour: d.getHours(),
    minute: d.getMinutes(),
  };
}
