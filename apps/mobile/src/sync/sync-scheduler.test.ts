import { describe, expect, it, vi } from "vitest";

import { RelayError, type RelayErrorKind } from "../net/relay-error";
import {
  backoffMs,
  createSyncScheduler,
  type SyncSchedulerOptions,
} from "./sync-scheduler";

interface Timer {
  readonly id: number;
  readonly at: number;
  readonly callback: () => void;
}

/** A clock that moves only when the test advances it. */
function fakeClock() {
  let now = 0;
  let counter = 0;
  let timers: Timer[] = [];
  return {
    setTimer: (callback: () => void, ms: number) => {
      counter += 1;
      timers.push({ id: counter, at: now + ms, callback });
      return counter;
    },
    clearTimer: (timer: unknown) => {
      timers = timers.filter((t) => t.id !== timer);
    },
    pending: () => timers.length,
    /** Moves the time and fires the due timers, letting promises settle. */
    advance: async (ms: number) => {
      const end = now + ms;
      for (;;) {
        const due = timers
          .filter((t) => t.at <= end)
          .sort((x, y) => x.at - y.at)[0];
        if (due === undefined) break;
        timers = timers.filter((t) => t !== due);
        now = due.at;
        due.callback();
        await settle();
      }
      now = end;
    },
  };
}

const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

function setup(overrides: Partial<SyncSchedulerOptions> = {}) {
  const clock = fakeClock();
  const closed = vi.fn();
  let notify: () => void = () => undefined;
  const run = vi.fn<() => Promise<void>>(() => Promise.resolve());
  const onPairGone = vi.fn();
  const scheduler = createSyncScheduler({
    run,
    transport: {
      onNotify: (listener) => {
        notify = listener;
        return closed;
      },
    },
    onPairGone,
    setTimer: clock.setTimer,
    clearTimer: clock.clearTimer,
    ...overrides,
  });
  return {
    clock,
    closed,
    run,
    onPairGone,
    scheduler,
    notify: () => {
      notify();
    },
  };
}

const fail = (kind: RelayErrorKind) => () =>
  Promise.reject(new RelayError(kind));

describe("createSyncScheduler", () => {
  it("runs at once on start and then every interval", async () => {
    const { clock, run, scheduler } = setup();
    scheduler.start();
    scheduler.start();
    await settle();
    expect(run).toHaveBeenCalledTimes(1);
    await clock.advance(59_999);
    expect(run).toHaveBeenCalledTimes(1);
    await clock.advance(1);
    expect(run).toHaveBeenCalledTimes(2);
    await clock.advance(60_000);
    expect(run).toHaveBeenCalledTimes(3);
  });

  it("collects the requests into one run after the delay", async () => {
    const { clock, run, scheduler } = setup();
    scheduler.start();
    await settle();
    scheduler.requestSync();
    scheduler.requestSync();
    await clock.advance(499);
    expect(run).toHaveBeenCalledTimes(1);
    await clock.advance(1);
    expect(run).toHaveBeenCalledTimes(2);
    // The interval starts again after the run.
    await clock.advance(59_999);
    expect(run).toHaveBeenCalledTimes(2);
    await clock.advance(1);
    expect(run).toHaveBeenCalledTimes(3);
  });

  it("ignores requests before start", async () => {
    const { clock, run, scheduler } = setup();
    scheduler.requestSync();
    await clock.advance(1_000);
    expect(run).not.toHaveBeenCalled();
  });

  it("runs on the sync message of the socket", async () => {
    const { clock, run, scheduler, notify } = setup();
    scheduler.start();
    await settle();
    notify();
    await clock.advance(500);
    expect(run).toHaveBeenCalledTimes(2);
  });

  it("never runs twice at once and adds one run after a busy one", async () => {
    const { clock, run, scheduler } = setup();
    let release: () => void = () => undefined;
    run.mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          release = resolve;
        }),
    );
    scheduler.start();
    await settle();
    scheduler.requestSync();
    scheduler.requestSync();
    await clock.advance(10_000);
    expect(run).toHaveBeenCalledTimes(1);
    release();
    await settle();
    expect(run).toHaveBeenCalledTimes(2);
    await settle();
    expect(run).toHaveBeenCalledTimes(2);
  });

  it("retries with a growing delay and resets it after a success", async () => {
    const { clock, run, scheduler } = setup();
    run.mockImplementation(fail("network"));
    scheduler.start();
    await settle();
    expect(run).toHaveBeenCalledTimes(1);
    await clock.advance(1_999);
    expect(run).toHaveBeenCalledTimes(1);
    await clock.advance(1);
    expect(run).toHaveBeenCalledTimes(2);
    await clock.advance(3_999);
    expect(run).toHaveBeenCalledTimes(2);
    await clock.advance(1);
    expect(run).toHaveBeenCalledTimes(3);
    run.mockImplementation(fail("server"));
    await clock.advance(8_000);
    expect(run).toHaveBeenCalledTimes(4);

    run.mockImplementation(() => Promise.resolve());
    await clock.advance(16_000);
    expect(run).toHaveBeenCalledTimes(5);
    run.mockImplementation(() => Promise.reject(new Error("boom")));
    await clock.advance(60_000);
    expect(run).toHaveBeenCalledTimes(6);
    await clock.advance(2_000);
    expect(run).toHaveBeenCalledTimes(7);
  });

  it("caps the delay at five minutes", () => {
    expect(backoffMs(1)).toBe(2_000);
    expect(backoffMs(8)).toBe(256_000);
    expect(backoffMs(9)).toBe(300_000);
    expect(backoffMs(30)).toBe(300_000);
  });

  it("repeats once at once after unauthorized, then backs off", async () => {
    const { clock, run, scheduler } = setup();
    run.mockImplementationOnce(fail("unauthorized"));
    scheduler.start();
    await settle();
    expect(run).toHaveBeenCalledTimes(2);

    run.mockImplementation(fail("unauthorized"));
    await clock.advance(60_000);
    expect(run).toHaveBeenCalledTimes(4);
    await clock.advance(1_999);
    expect(run).toHaveBeenCalledTimes(4);
    await clock.advance(1);
    expect(run).toHaveBeenCalledTimes(5);
  });

  it("waits longer when the rate is limited", async () => {
    const { clock, run, scheduler } = setup();
    run.mockImplementation(fail("rateLimited"));
    scheduler.start();
    await settle();
    await clock.advance(29_999);
    expect(run).toHaveBeenCalledTimes(1);
    await clock.advance(1);
    expect(run).toHaveBeenCalledTimes(2);
    await clock.advance(30_000);
    expect(run).toHaveBeenCalledTimes(3);
    await clock.advance(30_000);
    expect(run).toHaveBeenCalledTimes(4);
  });

  it.each(["forbidden", "expired"] as const)(
    "stops and reports pair-gone on %s",
    async (kind) => {
      const { clock, closed, run, onPairGone, scheduler, notify } = setup();
      run.mockImplementation(fail(kind));
      scheduler.start();
      await settle();
      expect(onPairGone).toHaveBeenCalledTimes(1);
      expect(closed).toHaveBeenCalledTimes(1);
      expect(clock.pending()).toBe(0);
      notify();
      scheduler.requestSync();
      await clock.advance(120_000);
      expect(run).toHaveBeenCalledTimes(1);
    },
  );

  it("cancels the timers and closes the socket on stop", async () => {
    const { clock, closed, run, scheduler } = setup();
    scheduler.start();
    await settle();
    scheduler.requestSync();
    expect(clock.pending()).toBe(2);
    scheduler.stop();
    scheduler.stop();
    expect(clock.pending()).toBe(0);
    expect(closed).toHaveBeenCalledTimes(1);
    await clock.advance(120_000);
    expect(run).toHaveBeenCalledTimes(1);
  });

  it("does not schedule again when stopped during a run", async () => {
    const { clock, run, scheduler } = setup();
    let release: () => void = () => undefined;
    run.mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          release = resolve;
        }),
    );
    scheduler.start();
    await settle();
    scheduler.stop();
    release();
    await settle();
    expect(clock.pending()).toBe(0);
  });

  it("uses the real timers by default", async () => {
    vi.useFakeTimers();
    try {
      const run = vi.fn(() => Promise.resolve());
      const scheduler = createSyncScheduler({
        run,
        transport: { onNotify: () => () => undefined },
        onPairGone: () => undefined,
        intervalMs: 1_000,
        debounceMs: 10,
      });
      scheduler.start();
      await vi.advanceTimersByTimeAsync(0);
      scheduler.requestSync();
      await vi.advanceTimersByTimeAsync(10);
      expect(run).toHaveBeenCalledTimes(2);
      await vi.advanceTimersByTimeAsync(1_000);
      expect(run).toHaveBeenCalledTimes(3);
      scheduler.requestSync();
      scheduler.stop();
      await vi.advanceTimersByTimeAsync(5_000);
      expect(run).toHaveBeenCalledTimes(3);
    } finally {
      vi.useRealTimers();
    }
  });
});
