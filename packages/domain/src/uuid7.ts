import type { Clock } from "./clock.js";

export interface RandomSource {
  /** Returns `length` random bytes. */
  bytes(length: number): Uint8Array;
}

export interface Uuid7Dependencies {
  clock: Clock;
  random: RandomSource;
}

const RANDOM_BITS = 74n;
const RANDOM_MASK = (1n << RANDOM_BITS) - 1n;
const RANDOM_B_BITS = 62n;
const RANDOM_B_MASK = (1n << RANDOM_B_BITS) - 1n;
const VARIANT = 0b10n;
const VERSION = 7n;
const MAX_TIMESTAMP = 2 ** 48 - 1;

const UUID7_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

export function isUuid7(value: string): boolean {
  return UUID7_PATTERN.test(value);
}

function freshRandom(random: RandomSource): bigint {
  let value = 0n;
  for (const byte of random.bytes(10)) {
    value = (value << 8n) | BigInt(byte);
  }
  return value & RANDOM_MASK;
}

function format(timestamp: number, randomPart: bigint): string {
  const randomA = randomPart >> RANDOM_B_BITS;
  const randomB = randomPart & RANDOM_B_MASK;
  const value =
    (BigInt(timestamp) << 80n) |
    (VERSION << 76n) |
    (randomA << 64n) |
    (VARIANT << RANDOM_B_BITS) |
    randomB;
  const hex = value.toString(16).padStart(32, "0");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

/**
 * Creates a generator of strictly increasing UUIDv7 values. When the clock does
 * not advance (same reading or moved back), the last timestamp is kept and the
 * random part is incremented by one.
 */
export function createUuid7Generator({
  clock,
  random,
}: Uuid7Dependencies): () => string {
  let lastTimestamp = -1;
  let lastRandom = 0n;

  return () => {
    const now = Math.floor(clock.nowMs());
    if (!Number.isFinite(now) || now < 0 || now > MAX_TIMESTAMP) {
      throw new RangeError(
        `Clock reading must be a finite number of milliseconds between 0 and ${String(MAX_TIMESTAMP)}, got ${String(now)}`,
      );
    }
    let timestamp = lastTimestamp;
    let randomPart: bigint;
    if (now > lastTimestamp) {
      timestamp = now;
      randomPart = freshRandom(random);
    } else if (lastRandom === RANDOM_MASK) {
      if (lastTimestamp >= MAX_TIMESTAMP) {
        throw new RangeError("UUIDv7 timestamp exceeds 48 bits");
      }
      timestamp = lastTimestamp + 1;
      randomPart = freshRandom(random);
    } else {
      randomPart = lastRandom + 1n;
    }
    lastTimestamp = timestamp;
    lastRandom = randomPart;
    return format(timestamp, randomPart);
  };
}
