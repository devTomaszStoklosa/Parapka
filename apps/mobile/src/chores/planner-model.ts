import {
  filterChores,
  fromDayNumber,
  listOccurrences,
  responsibleFor,
  toDayNumber,
  uuid7Timestamp,
  type CalendarDate,
  type ChoreFilter,
  type Responsible,
} from "@parapka/domain";
import { parseHlc } from "@parapka/sync";

import type { StoredChore } from "./chore-repository";
import type { StoredCompletion } from "./completion-repository";

export type PlannerView = "today" | "week" | "all";
export type PlannerFilter = "all" | ChoreFilter;

/** How many days a view looks ahead, counting from today. */
const AHEAD_DAYS: Record<PlannerView, number> = { today: 0, week: 6, all: 29 };
/** How far back the overdue occurrences are looked up. */
const BEHIND_DAYS = 30;

/** Who ticked an occurrence off (a device id) and when (ms). */
export interface RowCompletion {
  readonly by: string;
  readonly at: number;
}

/** One occurrence of a chore, as one row of the list. */
export interface PlannerRow {
  readonly key: string;
  readonly choreId: string;
  readonly title: string;
  readonly responsible: Responsible;
  readonly date: CalendarDate;
  readonly note: string | null;
  /** The time `HH:MM` of the reminder of the chore. */
  readonly reminder: string | null;
  /** The check-off of the occurrence, or null while it is not done. */
  readonly completion: RowCompletion | null;
}

export interface PlannerLists {
  /** Overdue and not ticked off; one neutral list, whoever is responsible. */
  readonly todo: PlannerRow[];
  /** The occurrences in the window of the view, ticked off or not. */
  readonly rows: PlannerRow[];
}

export interface PlannerInput {
  readonly chores: readonly StoredChore[];
  readonly completions: readonly StoredCompletion[];
  readonly today: CalendarDate;
  readonly view: PlannerView;
  readonly filter: PlannerFilter;
}

const pad = (value: number) => String(value).padStart(2, "0");

/** The local calendar day of a moment, e.g. `2026-11-11`. */
export function localDate(ms: number): CalendarDate {
  const date = new Date(ms);
  const year = String(date.getFullYear());
  return `${year}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/** `2026-11-05` as `05.11.2026`. */
export const formatDate = (date: string) => date.split("-").reverse().join(".");

/** A moment as local `05.11.2026 18:05`. */
export function formatMoment(ms: number): string {
  const date = new Date(ms);
  const day = [pad(date.getDate()), pad(date.getMonth() + 1)].join(".");
  const time = [pad(date.getHours()), pad(date.getMinutes())].join(":");
  return `${day}.${String(date.getFullYear())} ${time}`;
}

const shift = (date: CalendarDate, days: number) =>
  fromDayNumber(toDayNumber(date) + days);

/** Who is responsible on a day, or null before an alternating start. */
function responsibleOn(chore: StoredChore, date: CalendarDate) {
  try {
    return responsibleFor(chore, chore.assignment, date);
  } catch {
    // Only an alternating assignment throws, for a day before its start.
    return null;
  }
}

const keep = (chore: StoredChore, filter: PlannerFilter, date: CalendarDate) =>
  filter === "all" ||
  filterChores([{ chore, assignment: chore.assignment }], filter, date).length >
    0;

interface Source {
  readonly chores: readonly StoredChore[];
  readonly done: ReadonlyMap<string, RowCompletion>;
  readonly filter: PlannerFilter;
}

/** The range start, not before the day the chore was created (from its id). */
function startFrom(chore: StoredChore, from: CalendarDate): CalendarDate {
  const created = uuid7Timestamp(chore.id);
  if (created === null) return from;
  const day = localDate(created);
  return day > from ? day : from;
}

function occurrenceRows(
  { chores, done, filter }: Source,
  from: CalendarDate,
  to: CalendarDate,
) {
  const rows: PlannerRow[] = [];
  for (const chore of chores) {
    const start = startFrom(chore, from);
    if (start > to) continue;
    for (const { occurrenceDate: date } of listOccurrences(chore, start, to)) {
      const responsible = responsibleOn(chore, date);
      if (responsible === null || !keep(chore, filter, date)) continue;
      const key = [chore.id, date].join("|");
      rows.push({
        key,
        choreId: chore.id,
        title: chore.title,
        responsible,
        date,
        note: chore.note,
        reminder: chore.reminder,
        completion: done.get(key) ?? null,
      });
    }
  }
  return rows.sort(
    (a, b) =>
      a.date.localeCompare(b.date) ||
      a.title.localeCompare(b.title, "pl", {
        numeric: true,
        sensitivity: "base",
      }),
  );
}

/**
 * The lists of the planner for a day. Each occurrence is a separate row; the
 * filter looks at who is responsible on the day of that occurrence.
 */
export function buildPlanner(input: PlannerInput): PlannerLists {
  const { chores, completions, today, view, filter } = input;
  const done = new Map(
    completions.map((c) => [
      [c.choreId, c.occurrenceDate].join("|"),
      { by: c.completedBy, at: parseHlc(c.completedAt).physical },
    ]),
  );
  const source = { chores, done, filter };
  const behind = occurrenceRows(
    source,
    shift(today, -BEHIND_DAYS),
    shift(today, -1),
  );
  return {
    todo: behind.filter((row) => row.completion === null),
    rows: occurrenceRows(source, today, shift(today, AHEAD_DAYS[view])),
  };
}
