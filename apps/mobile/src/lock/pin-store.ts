import type { Sodium } from "@parapka/crypto";
import type { Clock } from "@parapka/domain";

import type { LocalDatabase } from "../data/local-database";
import {
  initialLockState,
  recordFailure,
  remainingDelayMs,
  unlock,
  type LockState,
  type LockTimeout,
} from "./lock-state";

const COLLECTION = "lock";
const PIN_ID = "pin";
const SETTINGS_ID = "settings";
const SALT_BYTES = 16;
const HASH_BYTES = 32;

/** What survives a restart: the timeout and the counter of wrong attempts. */
export interface LockSettings {
  readonly timeout: LockTimeout;
  readonly failedAttempts: number;
  readonly blockedUntilMs: number;
}

export type AttemptResult =
  | { readonly status: "ok" }
  | { readonly status: "wrong"; readonly delayMs: number }
  | { readonly status: "blocked"; readonly delayMs: number };

export interface PinStore {
  hasPin(): Promise<boolean>;
  /** Stores the salt and the Argon2id result of the PIN, never the PIN. */
  setPin(pin: string): Promise<void>;
  /** Checks a PIN without touching the attempt counter. */
  verifyPin(pin: string): Promise<boolean>;
  /** Checks a PIN, counts a wrong one and persists the counter. */
  attempt(pin: string): Promise<AttemptResult>;
  loadSettings(): Promise<LockSettings>;
  setTimeout(timeout: LockTimeout): Promise<void>;
}

export function isValidPin(pin: string): boolean {
  return /^\d{6}$/.test(pin);
}

function toHex(bytes: Uint8Array): string {
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

function fromHex(value: string): Uint8Array {
  return Uint8Array.from(value.match(/../g) ?? [], (b) => parseInt(b, 16));
}

/** Compares all bytes, so the time does not tell where they differ. */
export function equalConstantTime(a: Uint8Array, b: Uint8Array): boolean {
  let diff = a.length ^ b.length;
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    diff |= (a[i] ?? 0) ^ (b[i] ?? 0);
  }
  return diff === 0;
}

const encode = (pin: string) => Uint8Array.from(pin, (c) => c.charCodeAt(0));

async function loadSettings(database: LocalDatabase): Promise<LockSettings> {
  const value = (await database.get(
    COLLECTION,
    SETTINGS_ID,
  )) as LockSettings | null;
  return (
    value ?? { timeout: "immediately", failedAttempts: 0, blockedUntilMs: 0 }
  );
}

const saveSettings = (database: LocalDatabase, settings: LockSettings) =>
  database.put(COLLECTION, SETTINGS_ID, {
    timeout: settings.timeout,
    failedAttempts: settings.failedAttempts,
    blockedUntilMs: settings.blockedUntilMs,
  });

async function verifyPin(
  database: LocalDatabase,
  sodium: Sodium,
  pin: string,
): Promise<boolean> {
  const stored = (await database.get(COLLECTION, PIN_ID)) as {
    salt: string;
    hash: string;
  } | null;
  if (!stored || !isValidPin(pin)) return false;
  const hash = sodium.pwhash(HASH_BYTES, encode(pin), fromHex(stored.salt));
  return equalConstantTime(hash, fromHex(stored.hash));
}

async function attempt(
  deps: { database: LocalDatabase; sodium: Sodium; clock: Clock },
  pin: string,
): Promise<AttemptResult> {
  const { database, sodium, clock } = deps;
  const settings = await loadSettings(database);
  let state: LockState = {
    ...initialLockState(settings.timeout),
    failedAttempts: settings.failedAttempts,
    blockedUntilMs: settings.blockedUntilMs,
  };
  const blocked = remainingDelayMs(state, clock);
  if (blocked > 0) return { status: "blocked", delayMs: blocked };
  if (await verifyPin(database, sodium, pin)) {
    await saveSettings(database, unlock(state));
    return { status: "ok" };
  }
  state = recordFailure(state, clock);
  await saveSettings(database, state);
  return { status: "wrong", delayMs: remainingDelayMs(state, clock) };
}

export function createPinStore(deps: {
  database: LocalDatabase;
  sodium: Sodium;
  clock: Clock;
}): PinStore {
  const { database, sodium } = deps;
  return {
    hasPin: async () => (await database.get(COLLECTION, PIN_ID)) !== null,
    setPin: async (pin) => {
      if (!isValidPin(pin)) throw new Error("PIN must have 6 digits");
      const salt = sodium.randomBytes(SALT_BYTES);
      const hash = sodium.pwhash(HASH_BYTES, encode(pin), salt);
      await database.put(COLLECTION, PIN_ID, {
        salt: toHex(salt),
        hash: toHex(hash),
      });
    },
    verifyPin: (pin) => verifyPin(database, sodium, pin),
    attempt: (pin) => attempt(deps, pin),
    loadSettings: () => loadSettings(database),
    setTimeout: async (timeout) => {
      await saveSettings(database, {
        ...(await loadSettings(database)),
        timeout,
      });
    },
  };
}
