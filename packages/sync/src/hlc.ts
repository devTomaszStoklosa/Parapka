/** Source of physical time in milliseconds, injected into the clock (spec 7.2). */
export interface Clock {
  now(): number;
}

/** Hybrid Logical Clock timestamp (spec 7.5). */
export interface Hlc {
  readonly physical: number;
  readonly counter: number;
  readonly deviceId: string;
}

export const MAX_PHYSICAL = 999_999_999_999_999;
export const MAX_COUNTER = 99_999;

const PHYSICAL_WIDTH = 15;
const COUNTER_WIDTH = 5;
const TEXT_PATTERN = /^(\d{15})-(\d{5})-(.+)$/s;

function assertPhysical(physical: number): void {
  if (!Number.isInteger(physical) || physical < 0 || physical > MAX_PHYSICAL) {
    throw new RangeError(`HLC physical time out of range: ${String(physical)}`);
  }
}

function assertCounter(counter: number): void {
  if (!Number.isInteger(counter) || counter < 0 || counter > MAX_COUNTER) {
    throw new RangeError(`HLC counter out of range: ${String(counter)}`);
  }
}

function assertDeviceId(deviceId: string): void {
  if (deviceId === "") {
    throw new TypeError("HLC deviceId must not be empty");
  }
}

/** Creates a validated timestamp. */
export function createHlc(
  physical: number,
  counter: number,
  deviceId: string,
): Hlc {
  assertPhysical(physical);
  assertCounter(counter);
  assertDeviceId(deviceId);
  return { physical, counter, deviceId };
}

/** Total order: physical time, then counter, then deviceId (UTF-16 code units). */
export function compareHlc(a: Hlc, b: Hlc): -1 | 0 | 1 {
  if (a.physical !== b.physical) return a.physical < b.physical ? -1 : 1;
  if (a.counter !== b.counter) return a.counter < b.counter ? -1 : 1;
  if (a.deviceId !== b.deviceId) return a.deviceId < b.deviceId ? -1 : 1;
  return 0;
}

/**
 * Fixed-width text form `<physical>-<counter>-<deviceId>`; comparing the texts
 * with `<` gives the same order as `compareHlc`.
 */
export function formatHlc(hlc: Hlc): string {
  assertPhysical(hlc.physical);
  assertCounter(hlc.counter);
  assertDeviceId(hlc.deviceId);
  const physical = String(hlc.physical).padStart(PHYSICAL_WIDTH, "0");
  const counter = String(hlc.counter).padStart(COUNTER_WIDTH, "0");
  return `${physical}-${counter}-${hlc.deviceId}`;
}

/** Reads the text form; throws on any malformed text. */
export function parseHlc(text: string): Hlc {
  const match = TEXT_PATTERN.exec(text);
  if (match === null) {
    throw new SyntaxError(`Invalid HLC text: ${JSON.stringify(text)}`);
  }
  return createHlc(Number(match[1]), Number(match[2]), match[3] as string);
}

/** Hybrid Logical Clock of one device; its state lives only in memory. */
export class HybridLogicalClock {
  private last: Hlc | null = null;

  constructor(
    private readonly clock: Clock,
    private readonly deviceId: string,
  ) {
    assertDeviceId(deviceId);
  }

  /** Timestamp for a local event, greater than every earlier one. */
  now(): Hlc {
    return this.advance(null);
  }

  /** Merges a received timestamp; the next one is greater than it and than the last own. */
  receive(remote: Hlc): Hlc {
    assertPhysical(remote.physical);
    assertCounter(remote.counter);
    return this.advance(remote);
  }

  private advance(remote: Hlc | null): Hlc {
    const wall = this.clock.now();
    assertPhysical(wall);
    const last = this.last;
    const physical = Math.max(wall, last?.physical ?? 0, remote?.physical ?? 0);

    let counter = -1;
    if (last !== null && last.physical === physical)
      counter = Math.max(counter, last.counter);
    if (remote !== null && remote.physical === physical) {
      counter = Math.max(counter, remote.counter);
    }
    counter += 1;
    assertCounter(counter);

    const next = { physical, counter, deviceId: this.deviceId };
    this.last = next;
    return next;
  }
}
