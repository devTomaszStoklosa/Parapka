// @vitest-environment jsdom
import "fake-indexeddb/auto";
import type { Sodium } from "@parapka/crypto";
import {
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import type { KeyStore } from "../platform/key-store";
import { createMemoryKeyStore } from "../platform/memory-key-store";
import { createWebSodium } from "../platform/web-sodium";
import {
  createIndexedDbDatabase,
  DATABASE_KEY_NAME,
} from "./indexeddb-database";
import { describeLocalDatabaseContract } from "./local-database.contract";

let sodium: Sodium;
let keyStore: KeyStore;

beforeAll(async () => {
  sodium = await createWebSodium();
});

beforeEach(async () => {
  keyStore = createMemoryKeyStore();
  await createIndexedDbDatabase({ sodium, keyStore }).clear();
});

const create = () => createIndexedDbDatabase({ sodium, keyStore });

describeLocalDatabaseContract("IndexedDB", create);

function rawOpen(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open("parapka-data");
    req.onsuccess = () => {
      resolve(req.result);
    };
    req.onerror = () => {
      reject(new Error("open failed"));
    };
  });
}

async function rawRead(
  store: string,
  mode: "all" | "keys" = "all",
): Promise<unknown[]> {
  const db = await rawOpen();
  try {
    const objectStore = db.transaction(store).objectStore(store);
    const req =
      mode === "all" ? objectStore.getAll() : objectStore.getAllKeys();
    return await new Promise((resolve) => {
      req.onsuccess = () => {
        resolve(req.result);
      };
    });
  } finally {
    db.close();
  }
}

async function rawWrite(key: [string, string], value: unknown): Promise<void> {
  const db = await rawOpen();
  try {
    const tx = db.transaction("records", "readwrite");
    tx.objectStore("records").put(value, key);
    await new Promise((resolve) => {
      tx.oncomplete = resolve;
    });
  } finally {
    db.close();
  }
}

const asBinary = (value: unknown): Uint8Array => {
  const view = value as ArrayBufferView;
  return new Uint8Array(view.buffer, view.byteOffset, view.byteLength);
};

describe("encryption", () => {
  it("keeps no plain text in the raw records", async () => {
    await create().put("notes", "1", { text: "tajny-tekst-jawny" });
    const stored = await rawRead("records");
    expect(stored).toHaveLength(1);
    const bytes = asBinary(stored[0]);
    const text = new TextDecoder().decode(bytes);
    expect(text).not.toContain("tajny-tekst-jawny");
    expect(text).not.toContain("text");
    expect(await rawRead("records", "keys")).toEqual([["notes", "1"]]);
  });

  it("uses a different nonce for each write", async () => {
    const db = create();
    await db.put("notes", "1", "same");
    const first = asBinary((await rawRead("records"))[0]).slice(0, 24);
    await db.put("notes", "1", "same");
    const second = asBinary((await rawRead("records"))[0]).slice(0, 24);
    expect(second).not.toEqual(first);
  });

  it("rejects a record moved to another collection", async () => {
    const db = create();
    await db.put("a", "1", "secret");
    const [stored] = await rawRead("records");
    await rawWrite(["b", "1"], stored);
    await expect(db.get("b", "1")).rejects.toThrow(Error);
    expect(await db.get("a", "1")).toBe("secret");
  });

  it("rejects a record moved under another id", async () => {
    const db = create();
    await db.put("a", "1", "secret");
    const [stored] = await rawRead("records");
    await rawWrite(["a", "2"], stored);
    await expect(db.get("a", "2")).rejects.toThrow(Error);
  });

  it("does not let collection and id shift between each other", async () => {
    const db = create();
    await db.put("ab", "c", "secret");
    const [stored] = await rawRead("records");
    await rawWrite(["a", "bc"], stored);
    await expect(db.get("a", "bc")).rejects.toThrow(Error);
  });

  it("rejects a record that is not binary", async () => {
    const db = create();
    await db.put("a", "0", "init");
    await rawWrite(["a", "1"], "plain");
    await expect(db.get("a", "1")).rejects.toThrow(Error);
  });
});

describe("database key", () => {
  it("creates a 32 byte key at first use and reuses it", async () => {
    expect(await keyStore.get(DATABASE_KEY_NAME)).toBeNull();
    await create().put("a", "1", 1);
    const key = await keyStore.get(DATABASE_KEY_NAME);
    expect(key).toHaveLength(32);
    await create().put("a", "2", 2);
    expect(await keyStore.get(DATABASE_KEY_NAME)).toEqual(key);
  });

  it("reads data again after reopening", async () => {
    await create().put("a", "1", { v: [1, 2] });
    expect(await create().get("a", "1")).toEqual({ v: [1, 2] });
  });

  it("cannot read data with another key", async () => {
    await create().put("a", "1", "secret");
    await keyStore.set(DATABASE_KEY_NAME, sodium.randomBytes(32));
    await expect(create().get("a", "1")).rejects.toThrow(Error);
  });
});

describe("migrations", () => {
  it("stores the schema version and does not run them again", async () => {
    await create().put("a", "1", 1);
    const [version] = await rawRead("meta");
    expect(version).toBeGreaterThanOrEqual(1);
    await create().get("a", "1");
    expect(await rawRead("meta")).toEqual([version]);
  });
});

describe("clear", () => {
  it("removes the records, the schema version and the key", async () => {
    const db = create();
    await db.put("a", "1", "secret");
    await db.clear();
    expect(await rawRead("records")).toEqual([]);
    expect(await rawRead("meta")).toEqual([]);
    expect(await keyStore.get(DATABASE_KEY_NAME)).toBeNull();
  });

  it("creates a new key for data written after clear", async () => {
    const db = create();
    await db.put("a", "1", "old");
    const oldKey = await keyStore.get(DATABASE_KEY_NAME);
    await db.clear();
    await db.put("a", "1", "new");
    expect(await keyStore.get(DATABASE_KEY_NAME)).not.toEqual(oldKey);
    expect(await db.get("a", "1")).toBe("new");
  });
});

describe("failures", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("rejects when IndexedDB cannot be opened", async () => {
    const req = {} as IDBOpenDBRequest;
    vi.spyOn(indexedDB, "open").mockImplementation(() => {
      queueMicrotask(() => {
        req.onerror?.(new Event("error"));
      });
      return req;
    });
    await expect(create().get("a", "1")).rejects.toThrow();
  });

  it("retries opening after a failure", async () => {
    const db = create();
    vi.spyOn(keyStore, "get").mockRejectedValueOnce(new Error("locked"));
    await expect(db.get("a", "1")).rejects.toThrow("locked");
    await db.put("a", "1", "ok");
    expect(await db.get("a", "1")).toBe("ok");
  });
});
