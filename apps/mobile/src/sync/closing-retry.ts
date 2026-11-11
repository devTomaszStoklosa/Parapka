import { backoffMs } from "./sync-scheduler";

export interface ClosingRetryOptions {
  /** One try to finish the closing; true when nothing is left to do. */
  readonly finish: () => Promise<boolean>;
  readonly setTimer?: (callback: () => void, ms: number) => unknown;
  readonly clearTimer?: (timer: unknown) => void;
}

export interface ClosingRetry {
  /** Tries now, unless a try is running; a failure schedules the next one. */
  run(): void;
  /** Cancels the scheduled try; a stopped retry does not run again. */
  stop(): void;
}

/** Repeats `finish` with a growing delay (like the scheduler) until it succeeds. */
export function createClosingRetry(options: ClosingRetryOptions): ClosingRetry {
  const setTimer =
    options.setTimer ?? ((callback, ms) => setTimeout(callback, ms));
  const clearTimer =
    options.clearTimer ??
    ((timer) => {
      clearTimeout(timer as ReturnType<typeof setTimeout>);
    });
  let failures = 0;
  let running = false;
  let stopped = false;
  let timer: unknown = null;

  const cancel = () => {
    if (timer === null) return;
    clearTimer(timer);
    timer = null;
  };
  const attempt = async () => {
    const done = await options.finish().catch(() => false);
    running = false;
    if (done) {
      failures = 0;
      return;
    }
    failures += 1;
    if (!stopped) timer = setTimer(run, backoffMs(failures));
  };
  const run = () => {
    if (running || stopped) return;
    cancel();
    running = true;
    void attempt();
  };
  return {
    run,
    stop: () => {
      stopped = true;
      cancel();
    },
  };
}
