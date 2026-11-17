// @vitest-environment jsdom
import "fake-indexeddb/auto";
import { beforeAll, expect, it, vi } from "vitest";
import type { Sodium } from "@parapka/crypto";

import {
  DATABASE_KEY,
  createIndexedDbDatabase,
} from "../data/indexeddb-database";
import type { LocalDatabase } from "../data/local-database";
import { createMemoryDatabase } from "../data/memory-database";
import { createIndexedDbKeyStore } from "../platform/indexeddb-key-store";
import type { KeyStore } from "../platform/key-store";
import { createMemoryKeyStore } from "../platform/memory-key-store";
import { createWebSodium } from "../platform/web-sodium";
import { deleteAllData, type DeleteAllDeps } from "./delete-all";
import { EXPORTED_COLLECTIONS, SKIPPED_COLLECTIONS } from "./export-data";

let sodium: Sodium;

beforeAll(async () => {
  sodium = await createWebSodium();
});

// The names of identity/identity.ts and pairing/pair-repository.ts.
const KEYS = [
  DATABASE_KEY,
  "identity/signing-private",
  "identity/agreement-private",
  "pair/send",
  "pair/receive",
];
const COLLECTIONS = [...EXPORTED_COLLECTIONS, ...SKIPPED_COLLECTIONS];

function depsOf(database: LocalDatabase, keyStore: KeyStore): DeleteAllDeps {
  return {
    database,
    keyStore,
    pairs: { activePair: () => Promise.resolve(null) },
    disconnect: vi.fn(() => Promise.resolve()),
    credentials: () => Promise.resolve(null),
    client: vi.fn(),
  };
}

async function fill(database: LocalDatabase, keyStore: KeyStore) {
  for (const collection of COLLECTIONS) {
    await database.put(collection, "record", { value: collection });
  }
  for (const name of KEYS) await keyStore.set(name, new Uint8Array([1, 2, 3]));
}

it("leaves no collection and no key in memory", async () => {
  const database = createMemoryDatabase();
  const keyStore = createMemoryKeyStore();
  await fill(database, keyStore);
  expect(await deleteAllData(depsOf(database, keyStore))).toBe("done");
  for (const collection of COLLECTIONS) {
    expect(await database.list(collection)).toEqual([]);
  }
  for (const name of KEYS) expect(await keyStore.get(name)).toBeNull();
});

function keysOf(name: string, store: string): Promise<IDBValidKey[]> {
  return new Promise((resolve, reject) => {
    const open = indexedDB.open(name);
    open.onerror = () => {
      reject(new Error("open failed"));
    };
    open.onsuccess = () => {
      const db = open.result;
      const request = db
        .transaction(store, "readonly")
        .objectStore(store)
        .getAllKeys();
      request.onerror = () => {
        reject(new Error("read failed"));
      };
      request.onsuccess = () => {
        db.close();
        resolve(request.result);
      };
    };
  });
}

it("leaves nothing in the real IndexedDB stores", async () => {
  const keyStore = createIndexedDbKeyStore();
  const database = createIndexedDbDatabase({ sodium, keyStore });
  await fill(database, keyStore);
  expect((await keysOf("parapka-data", "records")).length).toBeGreaterThan(0);
  expect((await keysOf("parapka-keys", "keys")).length).toBeGreaterThan(0);
  expect(await deleteAllData(depsOf(database, keyStore))).toBe("done");
  expect(await keysOf("parapka-data", "records")).toEqual([]);
  expect(await keysOf("parapka-data", "meta")).toEqual([]);
  expect(await keysOf("parapka-keys", "keys")).toEqual([]);
});
