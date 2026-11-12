import {
  MENTAL_LOAD_TREND_MAX_WEEKS,
  type MentalLoadCarrier,
  type MentalLoadItem,
  type MentalLoadWeekInput,
} from "@parapka/domain";
import { currentCarriers, type Hlc } from "@parapka/sync";

import type { StoredItem } from "./item-repository";

/** A carrier entry with its parsed time. */
export interface SplitEntry {
  readonly itemId: string;
  readonly carrierId: string;
  readonly hlc: Hlc;
}

const DAY_MS = 86_400_000;

/** Local midnight of the Monday that starts the ISO week of `ms`. */
function weekStart(ms: number): Date {
  const date = new Date(ms);
  const sinceMonday = (date.getDay() + 6) % 7;
  return new Date(
    date.getFullYear(),
    date.getMonth(),
    date.getDate() - sinceMonday,
  );
}

/** The Monday of the next week, local midnight. */
function addWeeks(start: Date, weeks: number): Date {
  return new Date(
    start.getFullYear(),
    start.getMonth(),
    start.getDate() + 7 * weeks,
  );
}

/** ISO week (`YYYY-Www`) of the week that starts on `start`: that of its Thursday. */
function weekLabel(start: Date): string {
  const thursday = Date.UTC(
    start.getFullYear(),
    start.getMonth(),
    start.getDate() + 3,
  );
  const year = new Date(thursday).getUTCFullYear();
  const week = Math.floor((thursday - Date.UTC(year, 0, 1)) / DAY_MS / 7) + 1;
  return `${String(year)}-W${String(week).padStart(2, "0")}`;
}

/** ISO week (`YYYY-Www`) of a moment, in local time. */
export const isoWeek = (ms: number): string => weekLabel(weekStart(ms));

const relative = (carrier: string, own: string | null): MentalLoadCarrier => {
  if (carrier === "both") return carrier;
  return carrier === own ? "me" : "partner";
};

/** Items of the given state that are shared and have a carrier. */
function weighed(
  items: readonly StoredItem[],
  carriers: ReadonlyMap<string, string>,
  own: string | null,
  counts: (item: StoredItem) => boolean,
): MentalLoadItem[] {
  const result: MentalLoadItem[] = [];
  for (const item of items) {
    const carrier = carriers.get(item.id);
    if (!item.shared || carrier === undefined || !counts(item)) continue;
    result.push({
      category: item.category,
      carrier: relative(carrier, own),
      weight: item.weight,
      status: "open",
    });
  }
  return result;
}

/** The open shared items with their current carrier (FR-MNT-04, FR-MNT-06). */
export function currentLoad(
  items: readonly StoredItem[],
  entries: readonly SplitEntry[],
  own: string | null,
): MentalLoadItem[] {
  return weighed(
    items,
    currentCarriers(entries),
    own,
    ({ status }) => status === "open",
  );
}

/**
 * The state at the end of each ISO week, from the week of the first entry of
 * a shared item to the week of `nowMs`, at most the latest 12 weeks (FR-MNT-05).
 * An item counts in a week when its first entry and not its "done" come before
 * the end of the week; its carrier is the one of that moment.
 */
export function weekInputs(
  items: readonly StoredItem[],
  entries: readonly SplitEntry[],
  own: string | null,
  nowMs: number,
): MentalLoadWeekInput[] {
  const shared = new Set(
    items.filter((item) => item.shared).map(({ id }) => id),
  );
  const mine = entries.filter(({ itemId }) => shared.has(itemId));
  const first = new Map<string, number>();
  for (const { itemId, hlc } of mine) {
    first.set(itemId, Math.min(first.get(itemId) ?? Infinity, hlc.physical));
  }
  if (first.size === 0) return [];

  const last = weekStart(nowMs);
  const earliest = weekStart(Math.min(...first.values()));
  const oldest = addWeeks(last, 1 - MENTAL_LOAD_TREND_MAX_WEEKS);
  const weeks: MentalLoadWeekInput[] = [];
  for (
    let start = earliest < oldest ? oldest : earliest;
    start <= last;
    start = addWeeks(start, 1)
  ) {
    const end = addWeeks(start, 1).getTime();
    const carriers = currentCarriers(mine, end - 1);
    weeks.push({
      week: weekLabel(start),
      items: weighed(
        items,
        carriers,
        own,
        ({ id, doneAt }) =>
          (first.get(id) ?? Infinity) < end &&
          (doneAt === null || doneAt >= end),
      ),
    });
  }
  return weeks;
}
