import type { Sodium } from "@parapka/crypto";
import type { Clock } from "@parapka/domain";
import { beforeAll, describe, expect, it } from "vitest";

import { createMemoryDatabase } from "../data/memory-database";
import { createWebSodium } from "../platform/web-sodium";
import { equalConstantTime, createPinStore, isValidPin } from "./pin-store";

let sodium: Sodium;

beforeAll(async () => {
  sodium = await createWebSodium();
});

function setup() {
  let now = 5_000;
  const clock: Clock = { nowMs: () => now };
  const database = createMemoryDatabase();
  const store = createPinStore({ database, sodium, clock });
  return {
    database,
    store,
    advance: (ms: number) => {
      now += ms;
    },
  };
}

describe("PIN storage", () => {
  it("stores a salt and a hash, never the PIN", async () => {
    const { database, store } = setup();
    await store.setPin("123456");
    const stored = await database.get("lock", "pin");
    expect(Object.keys(stored as object).sort()).toEqual(["hash", "salt"]);
    expect(JSON.stringify(stored)).not.toContain("123456");
    const all = JSON.stringify(await database.list("lock"));
    expect(all).not.toContain("123456");
  });

  it("uses a new salt for every PIN", async () => {
    const { database, store } = setup();
    await store.setPin("123456");
    const first = await database.get("lock", "pin");
    await store.setPin("123456");
    expect(await database.get("lock", "pin")).not.toEqual(first);
  });

  it("verifies the right PIN and rejects another one", async () => {
    const { store } = setup();
    expect(await store.hasPin()).toBe(false);
    await store.setPin("123456");
    expect(await store.hasPin()).toBe(true);
    expect(await store.verifyPin("123456")).toBe(true);
    expect(await store.verifyPin("123457")).toBe(false);
    expect(await store.verifyPin("12345")).toBe(false);
  });

  it("rejects a PIN that has not 6 digits", async () => {
    const { store } = setup();
    await expect(store.setPin("12345")).rejects.toThrow();
    await expect(store.setPin("12345a")).rejects.toThrow();
    expect(isValidPin("000000")).toBe(true);
  });

  it("verifies nothing before a PIN is set", async () => {
    expect(await setup().store.verifyPin("123456")).toBe(false);
  });
});

describe("constant time comparison", () => {
  it("compares content and length", () => {
    expect(equalConstantTime(Uint8Array.of(1, 2), Uint8Array.of(1, 2))).toBe(
      true,
    );
    expect(equalConstantTime(Uint8Array.of(1, 2), Uint8Array.of(1, 3))).toBe(
      false,
    );
    expect(equalConstantTime(Uint8Array.of(1, 2), Uint8Array.of(1))).toBe(
      false,
    );
    expect(equalConstantTime(Uint8Array.of(), Uint8Array.of(0))).toBe(false);
  });
});

describe("attempts", () => {
  it("blocks after 5 wrong attempts and persists the counter", async () => {
    const { store, advance } = setup();
    await store.setPin("123456");
    for (let i = 0; i < 4; i++) {
      expect(await store.attempt("000000")).toEqual({
        status: "wrong",
        delayMs: 0,
      });
    }
    expect(await store.attempt("000000")).toEqual({
      status: "wrong",
      delayMs: 30_000,
    });
    expect(await store.attempt("123456")).toEqual({
      status: "blocked",
      delayMs: 30_000,
    });
    expect((await store.loadSettings()).failedAttempts).toBe(5);
    advance(30_000);
    expect(await store.attempt("123456")).toEqual({ status: "ok" });
    expect((await store.loadSettings()).failedAttempts).toBe(0);
  });

  it("keeps the timeout", async () => {
    const { store } = setup();
    expect((await store.loadSettings()).timeout).toBe("immediately");
    await store.setTimeout("fiveMinutes");
    await store.setPin("123456");
    await store.attempt("123456");
    expect((await store.loadSettings()).timeout).toBe("fiveMinutes");
  });
});
