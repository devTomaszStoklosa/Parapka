import { type Hlc, compareHlc } from "./hlc.js";

/** One check-off of one chore occurrence (spec 7.5). */
export interface ChoreCompletion {
  readonly choreId: string;
  /** Date of the occurrence, e.g. `2026-11-05`. */
  readonly occurrenceDate: string;
  readonly completedBy: string;
  readonly hlc: Hlc;
}

/** One change of the carrier of a mental-load item. */
export interface CarrierChange {
  readonly itemId: string;
  readonly carrierId: string;
  readonly hlc: Hlc;
}

export type HandoverStatus = "pending" | "accepted" | "declined";

/** One state entry of a handover request; the latest by HLC is current. */
export interface HandoverRequest {
  readonly requestId: string;
  readonly itemId: string;
  readonly status: HandoverStatus;
  readonly hlc: Hlc;
}

/** Compares entries by HLC, then by their other fields, so ties resolve the same everywhere. */
function compareEntries<T extends { readonly hlc: Hlc }>(a: T, b: T): number {
  const byHlc = compareHlc(a.hlc, b.hlc);
  if (byHlc !== 0) return byHlc;
  const rest = (entry: T): string =>
    JSON.stringify(Object.entries(entry).filter(([key]) => key !== "hlc").sort());
  const left = rest(a);
  const right = rest(b);
  if (left === right) return 0;
  return left < right ? -1 : 1;
}

/** Keeps one entry per key: the smallest or the greatest by `compareEntries`. */
function collapse<T extends { readonly hlc: Hlc }>(
  entries: Iterable<T>,
  keyOf: (entry: T) => string,
  keep: "min" | "max",
): Map<string, T> {
  const result = new Map<string, T>();
  for (const entry of entries) {
    const key = keyOf(entry);
    const current = result.get(key);
    if (current === undefined) {
      result.set(key, entry);
      continue;
    }
    const order = compareEntries(entry, current);
    if (keep === "min" ? order < 0 : order > 0) result.set(key, entry);
  }
  return result;
}

function sortedValues<T>(map: Map<string, T>): T[] {
  return [...map.entries()].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)).map(([, v]) => v);
}

/** One completion per occurrence: the one with the smallest HLC (FR-CHR-03). */
export function mergeCompletions(
  entries: Iterable<ChoreCompletion>,
): ChoreCompletion[] {
  return sortedValues(
    collapse(
      entries,
      (e) => JSON.stringify([e.choreId, e.occurrenceDate]),
      "min",
    ),
  );
}

/**
 * Carrier of each item: the latest entry by HLC among those whose physical
 * time is not later than `asOfMs` (all entries when omitted) (FR-MNT-02, FR-MNT-05).
 */
export function currentCarriers(
  entries: Iterable<CarrierChange>,
  asOfMs?: number,
): Map<string, string> {
  const visible: CarrierChange[] = [];
  for (const entry of entries) {
    if (asOfMs === undefined || entry.hlc.physical <= asOfMs) visible.push(entry);
  }
  const latest = collapse(visible, (e) => e.itemId, "max");
  return new Map([...latest].map(([itemId, e]) => [itemId, e.carrierId]));
}

/** Current status of each handover request: the latest entry by HLC. */
export function currentHandoverRequests(
  entries: Iterable<HandoverRequest>,
): Map<string, HandoverRequest> {
  return collapse(entries, (e) => e.requestId, "max");
}
