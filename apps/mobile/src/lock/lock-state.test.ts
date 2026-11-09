import type { Clock } from "@parapka/domain";
import { describe, expect, it } from "vitest";

import {
  DELAY_STEPS_MS,
  FREE_ATTEMPTS,
  initialLockState,
  onBackground,
  onForeground,
  recordFailure,
  remainingDelayMs,
  unlock,
  type LockState,
} from "./lock-state";

function fakeClock(start = 1_000_000) {
  let now = start;
  const clock: Clock = { nowMs: () => now };
  return {
    clock,
    advance: (ms: number) => {
      now += ms;
    },
  };
}

const unlocked = (timeout: LockState["timeout"]) =>
  unlock(initialLockState(timeout));

describe("lock timeout", () => {
  it("starts locked", () => {
    expect(initialLockState().locked).toBe(true);
  });

  it("locks at once when the timeout is immediately", () => {
    const { clock } = fakeClock();
    const state = onBackground(unlocked("immediately"), clock);
    expect(state.locked).toBe(true);
  });

  it.each([
    ["oneMinute", 60_000],
    ["fiveMinutes", 300_000],
  ] as const)(
    "%s locks only after the time in the background",
    (timeout, ms) => {
      const { clock, advance } = fakeClock();
      const away = onBackground(unlocked(timeout), clock);
      expect(away.locked).toBe(false);
      advance(ms - 1);
      expect(onForeground(away, clock).locked).toBe(false);
      advance(1);
      expect(onForeground(away, clock).locked).toBe(true);
    },
  );

  it("measures the time from the first move to the background", () => {
    const { clock, advance } = fakeClock();
    const first = onBackground(unlocked("oneMinute"), clock);
    advance(40_000);
    const again = onBackground(first, clock);
    expect(again).toBe(first);
    advance(30_000);
    expect(onForeground(again, clock).locked).toBe(true);
  });

  it("ignores a return without a move to the background", () => {
    const { clock } = fakeClock();
    const state = unlocked("oneMinute");
    expect(onForeground(state, clock)).toBe(state);
  });
});

describe("wrong attempts", () => {
  it("allows the first four attempts without delay", () => {
    const { clock } = fakeClock();
    let state = initialLockState();
    for (let i = 1; i < FREE_ATTEMPTS; i++) {
      state = recordFailure(state, clock);
      expect(remainingDelayMs(state, clock)).toBe(0);
    }
    expect(state.failedAttempts).toBe(FREE_ATTEMPTS - 1);
  });

  it("delays by 30 s, 1 min and 5 min, and keeps the last step", () => {
    const { clock, advance } = fakeClock();
    let state = initialLockState();
    for (let i = 1; i < FREE_ATTEMPTS; i++) state = recordFailure(state, clock);
    const seen: number[] = [];
    for (let i = 0; i < 5; i++) {
      state = recordFailure(state, clock);
      seen.push(remainingDelayMs(state, clock));
      advance(seen[i] ?? 0);
    }
    expect(DELAY_STEPS_MS).toEqual([30_000, 60_000, 300_000]);
    expect(seen).toEqual([30_000, 60_000, 300_000, 300_000, 300_000]);
  });

  it("counts the delay down with the clock", () => {
    const { clock, advance } = fakeClock();
    let state = initialLockState();
    for (let i = 0; i < FREE_ATTEMPTS; i++) state = recordFailure(state, clock);
    advance(10_000);
    expect(remainingDelayMs(state, clock)).toBe(20_000);
  });

  it("resets the counter after unlocking", () => {
    const { clock } = fakeClock();
    let state = initialLockState();
    for (let i = 0; i < FREE_ATTEMPTS; i++) state = recordFailure(state, clock);
    state = unlock(state);
    expect(state).toMatchObject({
      locked: false,
      failedAttempts: 0,
      blockedUntilMs: 0,
    });
  });
});
