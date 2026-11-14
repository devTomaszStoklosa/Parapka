import type { CalendarDate } from "@parapka/domain";

import { changeChannel } from "../data/change-listeners";
import type { JsonValue, LocalDatabase } from "../data/local-database";
import type { WellbeingEntry } from "./wellbeing-validation";

export const WELLBEING = "wellbeing-entries";

export interface WellbeingRepository {
  /** Adds the entry, or replaces the one of the same day. */
  put(entry: WellbeingEntry): Promise<void>;
  delete(date: CalendarDate): Promise<void>;
  get(date: CalendarDate): Promise<WellbeingEntry | null>;
  /** The entries from `from` to `to` inclusive, the oldest first. */
  range(from: CalendarDate, to: CalendarDate): Promise<WellbeingEntry[]>;
  subscribe(listener: () => void): () => void;
}

/** The wellbeing entries kept in the local database only, never synchronized. */
export function createWellbeingRepository(
  database: LocalDatabase,
): WellbeingRepository {
  const changes = changeChannel(database, "wellbeing");
  return {
    subscribe: changes.subscribe,
    put: async (entry) => {
      await database.put(WELLBEING, entry.date, entry as unknown as JsonValue);
      changes.notify();
    },
    delete: async (date) => {
      await database.delete(WELLBEING, date);
      changes.notify();
    },
    get: async (date) =>
      (await database.get(WELLBEING, date)) as unknown as WellbeingEntry | null,
    range: async (from, to) =>
      (await database.list(WELLBEING))
        .map(({ value }) => value as unknown as WellbeingEntry)
        .filter((entry) => entry.date >= from && entry.date <= to)
        .sort((a, b) => a.date.localeCompare(b.date)),
  };
}
