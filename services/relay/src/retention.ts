import type { Clock } from "@parapka/domain";
import type { RelayStore } from "./store/store.js";

/** Technical data is kept at most 14 days (NFR-PRV-05). */
export const RETENTION_MS = 14 * 24 * 60 * 60 * 1000;

/**
 * Deletes the technical data of the store past its time. Challenges and
 * invitations expire after minutes or hours, so everything it deletes is far
 * younger than `RETENTION_MS`; the request counters live in memory only.
 */
export function purgeTechnicalData(
  store: RelayStore,
  clock: Clock,
): Promise<void> {
  return store.purgeExpired(clock.nowMs());
}
