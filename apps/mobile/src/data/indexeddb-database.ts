import type { Sodium } from "@parapka/crypto";
import type { KeyStore } from "../platform/key-store";
import type { JsonValue, LocalDatabase } from "./local-database";
import { runMigrations, type SchemaVersion } from "./migrations";

const DATABASE = "parapka-data";
const RECORDS = "records";
const META = "meta";
const VERSION_KEY = "schemaVersion";

/** Name of the database key in the KeyStore. */
export const DATABASE_KEY_NAME = "database-key";
const KEY_BYTES = 32;
const NONCE_BYTES = 24;

export interface IndexedDbDatabaseOptions {
  sodium: Sodium;
  keyStore: KeyStore;
}

function request<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => {
      resolve(req.result);
    };
    req.onerror = () => {
      reject(new Error(req.error?.message));
    };
  });
}

function open(): Promise<IDBDatabase> {
  const req = indexedDB.open(DATABASE, 1);
  req.onupgradeneeded = () => {
    req.result.createObjectStore(RECORDS);
    req.result.createObjectStore(META);
  };
  return request(req);
}

async function transaction<T>(
  store: string,
  mode: IDBTransactionMode,
  run: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  const db = await open();
  try {
    return await request(run(db.transaction(store, mode).objectStore(store)));
  } finally {
    db.close();
  }
}

const encoder = new TextEncoder();
const decoder = new TextDecoder();

/** Unambiguous encoding of collection and id: they cannot be shifted. */
function additionalData(collection: string, id: string): Uint8Array {
  const name = encoder.encode(collection);
  const rest = encoder.encode(id);
  const out = new Uint8Array(4 + name.length + rest.length);
  new DataView(out.buffer).setUint32(0, name.length);
  out.set(name, 4);
  out.set(rest, 4 + name.length);
  return out;
}

function toBytes(value: unknown): Uint8Array {
  // Not instanceof: a stored value may come from another realm (jsdom).
  if (!ArrayBuffer.isView(value)) {
    throw new Error("Stored record is not binary");
  }
  return new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
}

interface Cipher {
  sodium: Sodium;
  key: Uint8Array;
}

function encrypt(
  { sodium, key }: Cipher,
  collection: string,
  id: string,
  value: JsonValue,
): Uint8Array {
  const nonce = sodium.randomBytes(NONCE_BYTES);
  const sealed = sodium.aeadEncrypt(
    Uint8Array.from(encoder.encode(JSON.stringify(value))),
    additionalData(collection, id),
    nonce,
    key,
  );
  const bytes = new Uint8Array(nonce.length + sealed.length);
  bytes.set(nonce);
  bytes.set(sealed, nonce.length);
  return bytes;
}

function decrypt(
  { sodium, key }: Cipher,
  collection: string,
  id: string,
  stored: unknown,
): JsonValue {
  const bytes = toBytes(stored);
  const plain = sodium.aeadDecrypt(
    bytes.slice(NONCE_BYTES),
    additionalData(collection, id),
    bytes.slice(0, NONCE_BYTES),
    key,
  );
  return JSON.parse(decoder.decode(plain)) as JsonValue;
}

/** Records encrypted with `key`; `clear` is left to the caller. */
function createRecords(cipher: Cipher): Omit<LocalDatabase, "clear"> {
  const get = async (collection: string, id: string) => {
    const stored: unknown = await transaction(RECORDS, "readonly", (s) =>
      s.get([collection, id]),
    );
    return stored === undefined
      ? null
      : decrypt(cipher, collection, id, stored);
  };
  return {
    get,
    put: async (collection, id, value) => {
      const bytes = encrypt(cipher, collection, id, value);
      await transaction(RECORDS, "readwrite", (s) =>
        s.put(bytes, [collection, id]),
      );
    },
    delete: async (collection, id) => {
      await transaction(RECORDS, "readwrite", (s) =>
        s.delete([collection, id]),
      );
    },
    list: async (collection) => {
      const range = IDBKeyRange.bound([collection], [collection, []]);
      const keys = await transaction(RECORDS, "readonly", (s) =>
        s.getAllKeys(range),
      );
      const out = [];
      for (const k of keys) {
        const id = (k as [string, string])[1];
        const value = await get(collection, id);
        if (value !== null) out.push({ id, value });
      }
      return out;
    },
  };
}

const schemaVersion: SchemaVersion = {
  get: async () => {
    const value: unknown = await transaction(META, "readonly", (s) =>
      s.get(VERSION_KEY),
    );
    return typeof value === "number" ? value : 0;
  },
  set: async (n) => {
    await transaction(META, "readwrite", (s) => s.put(n, VERSION_KEY));
  },
};

/**
 * LocalDatabase on IndexedDB (database `parapka-data`). Every value is
 * encrypted with XChaCha20-Poly1305 under a random 256-bit database key kept
 * in the KeyStore, created at first use (NFR-PRV-01).
 */
export function createIndexedDbDatabase({
  sodium,
  keyStore,
}: IndexedDbDatabaseOptions): LocalDatabase {
  let ready: Promise<Omit<LocalDatabase, "clear">> | undefined;

  async function loadKey(): Promise<Uint8Array> {
    const existing = await keyStore.get(DATABASE_KEY_NAME);
    if (existing) return existing;
    const created = sodium.randomBytes(KEY_BYTES);
    await keyStore.set(DATABASE_KEY_NAME, created);
    return created;
  }

  async function initialize(): Promise<Omit<LocalDatabase, "clear">> {
    const records = createRecords({ sodium, key: await loadKey() });
    await runMigrations({ ...records, clear: clearAll }, schemaVersion);
    return records;
  }

  /** Opens the database once; the key is created on the first call. */
  function records(): Promise<Omit<LocalDatabase, "clear">> {
    ready ??= initialize().catch((error: unknown) => {
      ready = undefined;
      throw error;
    });
    return ready;
  }

  async function clearAll(): Promise<void> {
    // Wait for a running initialization so it cannot recreate the key later.
    await ready?.catch(() => undefined);
    ready = undefined;
    await transaction(RECORDS, "readwrite", (s) => s.clear());
    await transaction(META, "readwrite", (s) => s.clear());
    await keyStore.delete(DATABASE_KEY_NAME);
  }

  return {
    get: async (collection, id) => (await records()).get(collection, id),
    put: async (collection, id, value) =>
      (await records()).put(collection, id, value),
    delete: async (collection, id) => (await records()).delete(collection, id),
    list: async (collection) => (await records()).list(collection),
    clear: clearAll,
  };
}
