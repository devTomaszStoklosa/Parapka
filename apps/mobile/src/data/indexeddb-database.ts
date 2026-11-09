import type { Sodium } from "@parapka/crypto";
import type { KeyStore } from "../platform/key-store";
import type { JsonValue, LocalDatabase } from "./local-database";
import {
  migrations,
  runMigrations,
  type Migration,
  type SchemaVersion,
} from "./migrations";

export const DATABASE_NAME = "parapka-data";
export const RECORDS = "records";
export const META = "meta";
/** Name of the database key in the KeyStore. */
export const DATABASE_KEY = "database-key";
export const VERSION_KEY = "schema-version";
const KEY_BYTES = 32;
const NONCE_BYTES = 24;

export interface IndexedDbDatabaseOptions {
  readonly sodium: Sodium;
  readonly keyStore: KeyStore;
  /** Defaults to `parapka-data`. */
  readonly name?: string;
  readonly migrations?: readonly Migration[];
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

function open(name: string): Promise<IDBDatabase> {
  const req = indexedDB.open(name, 1);
  req.onupgradeneeded = () => {
    req.result.createObjectStore(RECORDS);
    req.result.createObjectStore(META);
  };
  return request(req);
}

async function inStore<T>(
  name: string,
  store: string,
  mode: IDBTransactionMode,
  run: (objects: IDBObjectStore) => Promise<T>,
): Promise<T> {
  const db = await open(name);
  try {
    return await run(db.transaction(store, mode).objectStore(store));
  } finally {
    db.close();
  }
}

/** UTF-8 bytes as a plain Uint8Array (TextEncoder may return another realm's). */
function utf8(text: string): Uint8Array {
  return Uint8Array.from(new TextEncoder().encode(text));
}

/** Unambiguous encoding of collection and id, bound to the ciphertext. */
function additionalData(collection: string, id: string): Uint8Array {
  const name = utf8(collection);
  const idBytes = utf8(id);
  const out = new Uint8Array(4 + name.length + idBytes.length);
  new DataView(out.buffer).setUint32(0, name.length);
  out.set(name, 4);
  out.set(idBytes, 4 + name.length);
  return out;
}

function toBytes(value: unknown): Uint8Array {
  // Not instanceof: a stored value may come from another realm (jsdom).
  if (!ArrayBuffer.isView(value)) {
    throw new Error("Stored record is not binary");
  }
  return new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
}

/** The libsodium implementation and the database key. */
interface Cipher {
  readonly sodium: Sodium;
  readonly key: Uint8Array;
}

function seal(
  cipher: Cipher,
  collection: string,
  id: string,
  value: JsonValue,
): Uint8Array {
  const { sodium, key } = cipher;
  const nonce = sodium.randomBytes(NONCE_BYTES);
  const sealed = sodium.aeadEncrypt(
    utf8(JSON.stringify(value)),
    additionalData(collection, id),
    nonce,
    key,
  );
  const out = new Uint8Array(NONCE_BYTES + sealed.length);
  out.set(nonce);
  out.set(sealed, NONCE_BYTES);
  return out;
}

function unseal(
  cipher: Cipher,
  collection: string,
  id: string,
  stored: unknown,
): JsonValue {
  const { sodium, key } = cipher;
  const bytes = toBytes(stored);
  const plain = sodium.aeadDecrypt(
    bytes.slice(NONCE_BYTES),
    additionalData(collection, id),
    bytes.slice(0, NONCE_BYTES),
    key,
  );
  return JSON.parse(new TextDecoder().decode(plain)) as JsonValue;
}

/** Operations on the records with a known key; no setup, no clear. */
function records(cipher: Cipher, name: string): LocalDatabase {
  return {
    get: async (collection, id) => {
      const stored: unknown = await inStore(name, RECORDS, "readonly", (s) =>
        request(s.get([collection, id])),
      );
      return stored === undefined
        ? null
        : unseal(cipher, collection, id, stored);
    },
    put: async (collection, id, value) => {
      const sealed = seal(cipher, collection, id, value);
      await inStore(name, RECORDS, "readwrite", (s) =>
        request(s.put(sealed, [collection, id])),
      );
    },
    delete: async (collection, id) => {
      await inStore(name, RECORDS, "readwrite", (s) =>
        request(s.delete([collection, id])),
      );
    },
    list: async (collection) => {
      // Array keys sort after strings, so [collection, []] bounds every id.
      const range = IDBKeyRange.bound([collection], [collection, []]);
      const [keys, values] = await inStore(name, RECORDS, "readonly", (s) =>
        Promise.all([request(s.getAllKeys(range)), request(s.getAll(range))]),
      );
      return keys.map((recordKey, index) => {
        const id = (recordKey as [string, string])[1];
        return {
          id,
          value: unseal(cipher, collection, id, values[index]),
        };
      });
    },
    clear: () => Promise.resolve(),
  };
}

function schemaVersion(name: string): SchemaVersion {
  return {
    get: async () => {
      const stored: unknown = await inStore(name, META, "readonly", (s) =>
        request(s.get(VERSION_KEY)),
      );
      return typeof stored === "number" ? stored : 0;
    },
    set: async (version) => {
      await inStore(name, META, "readwrite", (s) =>
        request(s.put(version, VERSION_KEY)),
      );
    },
  };
}

async function loadKey(sodium: Sodium, keyStore: KeyStore) {
  const existing = await keyStore.get(DATABASE_KEY);
  if (existing) {
    return existing;
  }
  const key = sodium.randomBytes(KEY_BYTES);
  await keyStore.set(DATABASE_KEY, key);
  return key;
}

/**
 * LocalDatabase on IndexedDB. Every value is encrypted with
 * XChaCha20-Poly1305 under a random 256-bit key kept in the KeyStore, with a
 * random nonce; the additional data are the collection name and the id, so a
 * record cannot be moved elsewhere (NFR-PRV-01). The key is created on first
 * use and the migrations run before the first operation.
 */
export function createIndexedDbDatabase(
  options: IndexedDbDatabaseOptions,
): LocalDatabase {
  const { sodium, keyStore } = options;
  const name = options.name ?? DATABASE_NAME;
  let ready: Promise<LocalDatabase> | null = null;

  async function start(): Promise<LocalDatabase> {
    const db = records({ sodium, key: await loadKey(sodium, keyStore) }, name);
    await runMigrations(
      db,
      schemaVersion(name),
      options.migrations ?? migrations,
    );
    return db;
  }

  /** Creates the key and runs the migrations once per open database. */
  function prepare(): Promise<LocalDatabase> {
    ready ??= start().catch((error: unknown) => {
      ready = null;
      throw error;
    });
    return ready;
  }

  return {
    get: async (c, id) => (await prepare()).get(c, id),
    put: async (c, id, value) => (await prepare()).put(c, id, value),
    delete: async (c, id) => (await prepare()).delete(c, id),
    list: async (c) => (await prepare()).list(c),
    clear: async () => {
      await inStore(name, RECORDS, "readwrite", (s) => request(s.clear()));
      await inStore(name, META, "readwrite", (s) => request(s.clear()));
      await keyStore.delete(DATABASE_KEY);
      ready = null;
    },
  };
}
