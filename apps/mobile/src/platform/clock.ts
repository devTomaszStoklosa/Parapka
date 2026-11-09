import type { Clock } from "@parapka/domain";

/** Clock backed by the system time. */
export const systemClock: Clock = { nowMs: () => Date.now() };
