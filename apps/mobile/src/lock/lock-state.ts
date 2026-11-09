import type { Clock } from "@parapka/domain";

/** When the app locks after it went to the background (FR-SEC-01). */
export type LockTimeout = "immediately" | "oneMinute" | "fiveMinutes";

export const LOCK_TIMEOUT_MS: Readonly<Record<LockTimeout, number>> = {
  immediately: 0,
  oneMinute: 60_000,
  fiveMinutes: 300_000,
};

/** Wrong attempts allowed before the delay starts. */
export const FREE_ATTEMPTS = 5;

/** Delay after the 5th wrong attempt, then after each next one; the last step repeats. */
export const DELAY_STEPS_MS: readonly number[] = [30_000, 60_000, 300_000];

export interface LockState {
  readonly locked: boolean;
  readonly timeout: LockTimeout;
  /** When the app went to the background, null while it is in the foreground. */
  readonly backgroundedAtMs: number | null;
  readonly failedAttempts: number;
  /** No attempt is accepted before this time. */
  readonly blockedUntilMs: number;
}

export function initialLockState(
  timeout: LockTimeout = "immediately",
): LockState {
  return {
    locked: true,
    timeout,
    backgroundedAtMs: null,
    failedAttempts: 0,
    blockedUntilMs: 0,
  };
}

export function onBackground(state: LockState, clock: Clock): LockState {
  if (state.backgroundedAtMs !== null) return state;
  return {
    ...state,
    locked: state.locked || state.timeout === "immediately",
    backgroundedAtMs: clock.nowMs(),
  };
}

export function onForeground(state: LockState, clock: Clock): LockState {
  if (state.backgroundedAtMs === null) return state;
  const away = clock.nowMs() - state.backgroundedAtMs;
  return {
    ...state,
    locked: state.locked || away >= LOCK_TIMEOUT_MS[state.timeout],
    backgroundedAtMs: null,
  };
}

export function unlock(state: LockState): LockState {
  return { ...state, locked: false, failedAttempts: 0, blockedUntilMs: 0 };
}

/** Counts a wrong PIN; from the 5th one on, blocks further attempts for a while. */
export function recordFailure(state: LockState, clock: Clock): LockState {
  const failedAttempts = state.failedAttempts + 1;
  if (failedAttempts < FREE_ATTEMPTS) return { ...state, failedAttempts };
  const step = Math.min(
    failedAttempts - FREE_ATTEMPTS,
    DELAY_STEPS_MS.length - 1,
  );
  return {
    ...state,
    failedAttempts,
    blockedUntilMs: clock.nowMs() + (DELAY_STEPS_MS[step] ?? 0),
  };
}

/** Milliseconds until the next attempt is accepted; 0 when it is accepted now. */
export function remainingDelayMs(state: LockState, clock: Clock): number {
  return Math.max(0, state.blockedUntilMs - clock.nowMs());
}
