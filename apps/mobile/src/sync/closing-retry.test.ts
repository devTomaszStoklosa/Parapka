import { afterEach, expect, it, vi } from "vitest";

import { createClosingRetry } from "./closing-retry";
import { backoffMs } from "./sync-scheduler";

afterEach(() => {
  vi.useRealTimers();
});

it("tries once and stops when the closing is finished", async () => {
  vi.useFakeTimers();
  const finish = vi.fn(() => Promise.resolve(true));
  createClosingRetry({ finish }).run();
  await vi.advanceTimersByTimeAsync(10 * backoffMs(1));
  expect(finish).toHaveBeenCalledTimes(1);
});

it("retries with a growing delay, also after an exception", async () => {
  vi.useFakeTimers();
  const results = [false, "throw", true];
  const finish = vi.fn(() => {
    const next = results.shift();
    return next === "throw"
      ? Promise.reject(new Error("boom"))
      : Promise.resolve(next === true);
  });
  createClosingRetry({ finish }).run();
  await vi.advanceTimersByTimeAsync(0);
  expect(finish).toHaveBeenCalledTimes(1);
  await vi.advanceTimersByTimeAsync(backoffMs(1));
  expect(finish).toHaveBeenCalledTimes(2);
  await vi.advanceTimersByTimeAsync(backoffMs(2) - 1);
  expect(finish).toHaveBeenCalledTimes(2);
  await vi.advanceTimersByTimeAsync(1);
  expect(finish).toHaveBeenCalledTimes(3);
  await vi.advanceTimersByTimeAsync(10 * backoffMs(3));
  expect(finish).toHaveBeenCalledTimes(3);
});

it("does not run twice at once and runs at once after a wait", async () => {
  vi.useFakeTimers();
  const finish = vi.fn(() => Promise.resolve(false));
  const retry = createClosingRetry({ finish });
  retry.run();
  retry.run();
  await vi.advanceTimersByTimeAsync(0);
  expect(finish).toHaveBeenCalledTimes(1);
  retry.run();
  await vi.advanceTimersByTimeAsync(0);
  expect(finish).toHaveBeenCalledTimes(2);
  retry.stop();
});

it("does not run after stop", async () => {
  vi.useFakeTimers();
  const finish = vi.fn(() => Promise.resolve(false));
  const retry = createClosingRetry({ finish });
  retry.run();
  await vi.advanceTimersByTimeAsync(0);
  retry.stop();
  await vi.advanceTimersByTimeAsync(10 * backoffMs(1));
  retry.run();
  expect(finish).toHaveBeenCalledTimes(1);
});

it("does not schedule when stopped during a try", async () => {
  vi.useFakeTimers();
  const finish = vi.fn(() => Promise.resolve(false));
  const retry = createClosingRetry({ finish });
  retry.run();
  retry.stop();
  await vi.advanceTimersByTimeAsync(10 * backoffMs(1));
  expect(finish).toHaveBeenCalledTimes(1);
});

it("uses the timers it is given", async () => {
  const timers: (() => void)[] = [];
  const cleared: unknown[] = [];
  const finish = vi.fn(() => Promise.resolve(false));
  const retry = createClosingRetry({
    finish,
    setTimer: (callback) => timers.push(callback),
    clearTimer: (timer) => cleared.push(timer),
  });
  retry.run();
  await Promise.resolve();
  await Promise.resolve();
  retry.stop();
  expect(timers).toHaveLength(1);
  expect(cleared).toEqual([1]);
});
