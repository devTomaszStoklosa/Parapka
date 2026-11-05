import { ChoreValidationError } from "./chore.js";
import type { Person } from "./chore-responsibility.js";

export const MENTAL_LOAD_CATEGORIES = [
  "children",
  "home",
  "finances",
  "health",
  "family-and-friends",
  "other",
] as const;

export type MentalLoadCategory = (typeof MENTAL_LOAD_CATEGORIES)[number];

export type MentalLoadWeight = 1 | 2 | 3;

export const DEFAULT_MENTAL_LOAD_WEIGHT: MentalLoadWeight = 2;

export type MentalLoadCarrier = Person | "both";

export type MentalLoadStatus = "open" | "done";

export interface MentalLoadItem {
  category: MentalLoadCategory;
  carrier: MentalLoadCarrier;
  weight: MentalLoadWeight;
  status: MentalLoadStatus;
}

/** Share of each person in whole percent; the two values sum to 100. */
export interface MentalLoadSplit {
  me: number;
  partner: number;
}

/** ISO week as `YYYY-Www`, e.g. `2026-W07`. */
export type IsoWeek = string;

export interface MentalLoadWeekInput {
  week: IsoWeek;
  items: readonly MentalLoadItem[];
}

export interface MentalLoadSnapshot {
  week: IsoWeek;
  split: MentalLoadSplit | null;
}

export const MENTAL_LOAD_TREND_MAX_WEEKS = 12;

const ISO_WEEK_PATTERN = /^\d{4}-W(0[1-9]|[1-4]\d|5[0-3])$/;

export function createMentalLoadItem(input: {
  category: MentalLoadCategory;
  carrier: MentalLoadCarrier;
  weight?: number;
  status?: MentalLoadStatus;
}): MentalLoadItem {
  const weight = input.weight ?? DEFAULT_MENTAL_LOAD_WEIGHT;
  if (weight !== 1 && weight !== 2 && weight !== 3) {
    throw new ChoreValidationError("mental load weight must be 1, 2 or 3");
  }
  if (!(MENTAL_LOAD_CATEGORIES as readonly string[]).includes(input.category)) {
    throw new ChoreValidationError("invalid mental load category");
  }
  if (!["me", "partner", "both"].includes(input.carrier)) {
    throw new ChoreValidationError("invalid mental load carrier");
  }
  return {
    category: input.category,
    carrier: input.carrier,
    weight,
    status: input.status ?? "open",
  };
}

/**
 * Weighted share of each person in the open items, in whole percent summing to
 * 100 (largest remainder). An item carried by both counts half for each.
 * `null` when there is nothing open.
 */
export function mentalLoadSplit(
  items: readonly MentalLoadItem[],
): MentalLoadSplit | null {
  // Whole units: an item is worth 2 × weight, a shared one gives each the weight.
  let me = 0;
  let partner = 0;
  for (const item of items) {
    if (item.status !== "open") continue;
    if (item.carrier === "me") me += item.weight * 2;
    else if (item.carrier === "partner") partner += item.weight * 2;
    else {
      me += item.weight;
      partner += item.weight;
    }
  }
  const total = me + partner;
  if (total === 0) return null;

  const meFloor = Math.floor((me * 100) / total);
  const partnerFloor = Math.floor((partner * 100) / total);
  const missing = 100 - meFloor - partnerFloor;
  if (missing === 0) return { me: meFloor, partner: partnerFloor };

  // At most one point is missing for two people; it goes to the larger remainder.
  const meRemainder = (me * 100) % total;
  const partnerRemainder = (partner * 100) % total;
  return partnerRemainder > meRemainder
    ? { me: meFloor, partner: partnerFloor + 1 }
    : { me: meFloor + 1, partner: partnerFloor };
}

/**
 * Weekly snapshots, oldest first, at most the 12 latest weeks. The caller
 * supplies the state of the items for each week.
 */
export function mentalLoadTrend(
  weeks: readonly MentalLoadWeekInput[],
): MentalLoadSnapshot[] {
  for (const { week } of weeks) {
    if (!ISO_WEEK_PATTERN.test(week)) {
      throw new ChoreValidationError("invalid ISO week");
    }
  }
  return [...weeks]
    .sort((a, b) => (a.week < b.week ? -1 : a.week > b.week ? 1 : 0))
    .slice(-MENTAL_LOAD_TREND_MAX_WEEKS)
    .map(({ week, items }) => ({ week, split: mentalLoadSplit(items) }));
}
