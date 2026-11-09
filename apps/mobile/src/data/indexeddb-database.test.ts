// @vitest-environment jsdom
import "fake-indexeddb/auto";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { Sodium } from "@parapka/crypto";
import { createMemoryKeyStore } from "../platform/memory-key-store";
import type { KeyStore } from "../platform/key-store";
import { createWebSodium } from "../platform/web-sodium";
import {
  DATABASE_KEY,
  DATABASE_NAME,
  META,
  RECORDS,
  VERSION_KEY,
  createIndexedDbDatabase,
} from "./indexeddb-database";
import { describeLocalDatabaseContract } from "./local-database.contract";
import type { Migration } from "./migrations";

let sodium: Sodium;
let keyStore: KeyStore;

beforeAll(async () => {
  sodium = await createWebSodium();
});

beforeEach(async () => {
  keyStore = createMemoryKeyStore();
  await createIndexedDbDatabase({ sodium, keyStore }).clear();
});

function create(migrations?: readonly Migration[]) {
  return createIndexedDbDatabase({ sodium, keyStore, migrations });
}

function request<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => {
      resolve(req.result);
    };
    req.onerror = () => {
      reject(new Error("request failed"));
    };
  });
}

/** Everything stored in a store of the raw IndexedDB, as [key, value]. */
async function rawEntries(store: string): Promise<[IDBValidKey, unknown][]> {
  const db = await request(indexedDB.open(DATABASE_NAME, 1));
  try {
    const objects = db.transaction(store).objectStore(store);
    const keys = await request(objects.getAllKeys());
    const values: unknown[] = await request(objects.getAll());
    return keys.map((key, i) => [key, values[i]]);
  } finally {
    db.close();
  }
}

async function rawPut(key: IDBValidKey, value: unknown): Promise<void> {
  const db = await request(indexedDB.open(DATABASE_NAME, 1));
  try {
    await request(
      db.transaction(RECORDS, "readwrite").objectStore(RECORDS).put(value, key),
    );
  } finally {
    db.close();
  }
}

function bytesOf(value: unknown): Uint8Array {
  const view = value as ArrayBufferView;
  return new Uint8Array(view.buffer, view.byteOffset, view.byteLength);
}

describeLocalDatabaseContract("IndexedDB", () => create());

describe("IndexedDB encryption", () => {
  it("stores no plain text of the value in the raw database", async () => {
    const db = create();
    await db.put("notes", "1", { secret: "tajny-tekst-do-ukrycia" });
    const entries = await rawEntries(RECORDS);
    expect(entries).toHaveLength(1);
    const raw = new TextDecoder("latin1").decode(bytesOf(entries[0]?.[1]));
    expect(raw).not.toContain("tajny-tekst-do-ukrycia");
    expect(raw).not.toContain("secret");
  });

  it("uses a different nonce for every write", async () => {
    const db = create();
    await db.put("notes", "1", "same");
    const first = bytesOf((await rawEntries(RECORDS))[0]?.[1]).slice(0, 24);
    await db.put("notes", "1", "same");
    const second = bytesOf((await rawEntries(RECORDS))[0]?.[1]).slice(0, 24);
    expect(second).not.toEqual(first);
  });

  it("rejects a record moved to another collection", async () => {
    const db = create();
    await db.put("a", "1", "x");
    const stored = (await rawEntries(RECORDS))[0]?.[1];
    await rawPut(["b", "1"], stored);
    await expect(db.get("b", "1")).rejects.toThrow();
  });

  it("rejects a record moved to another id", async () => {
    const db = create();
    await db.put("a", "1", "x");
    const stored = (await rawEntries(RECORDS))[0]?.[1];
    await rawPut(["a", "2"], stored);
    await expect(db.get("a", "2")).rejects.toThrow();
  });

  it("rejects a tampered record", async () => {
    const db = create();
    await db.put("a", "1", "x");
    const stored = bytesOf((await rawEntries(RECORDS))[0]?.[1]).slice();
    stored[stored.length - 1] = (stored.at(-1) ?? 0) ^ 1;
    await rawPut(["a", "1"], stored);
    await expect(db.get("a", "1")).rejects.toThrow();
  });
});

describe("IndexedDB database key", () => {
  it("creates a 32-byte key in the KeyStore on first use", async () => {
    expect(await keyStore.get(DATABASE_KEY)).toBeNull();
    await create().get("a", "1");
    expect((await keyStore.get(DATABASE_KEY))?.length).toBe(32);
  });

  it("reuses the key and reads old data after reopening", async () => {
    await create().put("a", "1", "x");
    const key = await keyStore.get(DATABASE_KEY);
    expect(await create().get("a", "1")).toBe("x");
    expect(await keyStore.get(DATABASE_KEY)).toEqual(key);
  });

  it("cannot read the data without the key", async () => {
    await create().put("a", "1", "x");
    await keyStore.set(DATABASE_KEY, sodium.randomBytes(32));
    await expect(create().get("a", "1")).rejects.toThrow();
  });
});

describe("IndexedDB failures", () => {
  it("rejects a stored record that is not binary", async () => {
    const db = create();
    await db.put("a", "1", "x");
    await rawPut(["a", "1"], "plain");
    await expect(db.get("a", "1")).rejects.toThrow("not binary");
  });

  it("retries the setup after it failed", async () => {
    let failures = 1;
    const flaky: KeyStore = {
      ...keyStore,
      get: (name) => {
        if (failures-- > 0) {
          return Promise.reject(new Error("key store down"));
        }
        return keyStore.get(name);
      },
    };
    const db = createIndexedDbDatabase({ sodium, keyStore: flaky });
    await expect(db.get("a", "1")).rejects.toThrow("key store down");
    expect(await db.get("a", "1")).toBeNull();
  });

  it("lets a migration call clear without effect", async () => {
    const db = create([{ version: 1, run: (inner) => inner.clear() }]);
    expect(await db.list("a")).toEqual([]);
  });
});

describe("IndexedDB clear", () => {
  it("removes the data, the schema version and the key", async () => {
    const db = create();
    await db.put("a", "1", "x");
    expect(await rawEntries(META)).toHaveLength(1);
    await db.clear();
    expect(await rawEntries(RECORDS)).toEqual([]);
    expect(await rawEntries(META)).toEqual([]);
    expect(await keyStore.get(DATABASE_KEY)).toBeNull();
  });

  it("works again with a new key afterwards", async () => {
    const db = create();
    await db.put("a", "1", "x");
    const oldKey = await keyStore.get(DATABASE_KEY);
    await db.clear();
    await db.put("a", "1", "y");
    expect(await db.get("a", "1")).toBe("y");
    expect(await keyStore.get(DATABASE_KEY)).not.toEqual(oldKey);
  });
});

describe("IndexedDB migrations", () => {
  function counting(log: number[]): Migration[] {
    return [1, 2].map((version) => ({
      version,
      run: async (db) => {
        log.push(version);
        await db.put("migrated", String(version), true);
      },
    }));
  }

  it("runs the migrations on first use and stores the version", async () => {
    const log: number[] = [];
    const db = create(counting(log));
    expect(await db.get("migrated", "2")).toBe(true);
    expect(log).toEqual([1, 2]);
    const meta = await rawEntries(META);
    expect(meta).toEqual([[VERSION_KEY, 2]]);
  });

  it("does not run them again when the database is reopened", async () => {
    const log: number[] = [];
    await create(counting(log)).list("migrated");
    await create(counting(log)).list("migrated");
    expect(log).toEqual([1, 2]);
  });
});
