import { RelayError } from "../net/relay-error";
import type { SyncTransport } from "./transport";

export const DEFAULT_INTERVAL_MS = 60_000;
export const DEFAULT_DEBOUNCE_MS = 500;
export const INITIAL_BACKOFF_MS = 2_000;
export const MAX_BACKOFF_MS = 300_000;
/** The shortest wait after the relay limited the rate. */
export const RATE_LIMIT_MIN_MS = 30_000;

export interface SyncSchedulerOptions {
  /** One synchronization run, for example `engine.sync`. */
  readonly run: () => Promise<void>;
  readonly transport: Pick<SyncTransport, "onNotify">;
  /** Called once when the relay says the pair mailbox is gone (403/410). */
  readonly onPairGone: () => void;
  readonly intervalMs?: number;
  readonly debounceMs?: number;
  readonly setTimer?: (callback: () => void, ms: number) => unknown;
  readonly clearTimer?: (timer: unknown) => void;
}

export interface SyncScheduler {
  /** Runs now, then every interval; listens to the relay notifications. */
  start(): void;
  /** Asks for a run after a short delay that collects the requests. */
  requestSync(): void;
  /** Cancels the timers and closes the notification channel. */
  stop(): void;
}

/** Delay before the retry after the `failures`-th failure in a row. */
export function backoffMs(failures: number): number {
  return Math.min(INITIAL_BACKOFF_MS * 2 ** (failures - 1), MAX_BACKOFF_MS);
}

class Scheduler implements SyncScheduler {
  private readonly intervalMs: number;
  private readonly debounceMs: number;
  private readonly setTimer: (callback: () => void, ms: number) => unknown;
  private readonly clearTimer: (timer: unknown) => void;
  private started = false;
  private stopped = false;
  private running = false;
  private again = false;
  private failures = 0;
  private retriedUnauthorized = false;
  private debounceTimer: unknown = null;
  private nextTimer: unknown = null;
  private unlisten: (() => void) | null = null;

  constructor(private readonly o: SyncSchedulerOptions) {
    this.intervalMs = o.intervalMs ?? DEFAULT_INTERVAL_MS;
    this.debounceMs = o.debounceMs ?? DEFAULT_DEBOUNCE_MS;
    this.setTimer = o.setTimer ?? ((callback, ms) => setTimeout(callback, ms));
    this.clearTimer =
      o.clearTimer ??
      ((timer) => {
        clearTimeout(timer as ReturnType<typeof setTimeout>);
      });
  }

  start = (): void => {
    if (this.started) return;
    this.started = true;
    this.unlisten = this.o.transport.onNotify(this.requestSync);
    void this.cycle();
  };

  requestSync = (): void => {
    if (!this.started || this.stopped) return;
    if (this.running) {
      this.again = true;
      return;
    }
    // After a failure the retry timer decides when the next run happens.
    if (this.failures > 0 || this.debounceTimer !== null) return;
    this.debounceTimer = this.setTimer(() => {
      this.debounceTimer = null;
      void this.cycle();
    }, this.debounceMs);
  };

  stop = (): void => {
    this.stopped = true;
    this.clearTimers();
    this.unlisten?.();
    this.unlisten = null;
  };

  /** A request came in during the run; a method, as a run changes the flag. */
  private requested(): boolean {
    return this.again;
  }

  private clearTimers(): void {
    if (this.debounceTimer !== null) this.clearTimer(this.debounceTimer);
    if (this.nextTimer !== null) this.clearTimer(this.nextTimer);
    this.debounceTimer = null;
    this.nextTimer = null;
  }

  /** Runs once and returns the wait before the next run; 0 means at once. */
  private async attempt(): Promise<number> {
    try {
      await this.o.run();
      this.failures = 0;
      this.retriedUnauthorized = false;
      return this.intervalMs;
    } catch (error) {
      const kind = error instanceof RelayError ? error.kind : null;
      if (kind === "forbidden" || kind === "expired") {
        this.stop();
        this.o.onPairGone();
        return this.intervalMs;
      }
      if (kind === "unauthorized" && !this.retriedUnauthorized) {
        this.retriedUnauthorized = true;
        return 0;
      }
      this.failures += 1;
      const wait = backoffMs(this.failures);
      return kind === "rateLimited" ? Math.max(wait, RATE_LIMIT_MIN_MS) : wait;
    }
  }

  private async cycle(): Promise<void> {
    // Only the timers start a cycle, and a run clears them first.
    this.running = true;
    this.clearTimers();
    let wait: number;
    do {
      this.again = false;
      wait = await this.attempt();
    } while (
      !this.stopped &&
      (wait === 0 || (this.requested() && wait === this.intervalMs))
    );
    this.running = false;
    if (!this.stopped) {
      this.nextTimer = this.setTimer(() => {
        this.nextTimer = null;
        void this.cycle();
      }, wait);
    }
  }
}

export function createSyncScheduler(
  options: SyncSchedulerOptions,
): SyncScheduler {
  return new Scheduler(options);
}
