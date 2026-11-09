import type { KeyStore } from "./key-store";

const DATABASE = "parapka-keys";
const STORE = "keys";

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
    req.result.createObjectStore(STORE);
  };
  return request(req);
}

function transaction<T>(
  mode: IDBTransactionMode,
  run: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  return open().then(async (db) => {
    try {
      return await request(run(db.transaction(STORE, mode).objectStore(STORE)));
    } finally {
      db.close();
    }
  });
}

/**
 * KeyStore on IndexedDB (database `parapka-keys`).
 *
 * WARNING: keys are stored in the browser without hardware protection. This
 * is for tests and browser-first development only; native key storage
 * (Keychain/Keystore) comes in M9.
 */
export function createIndexedDbKeyStore(): KeyStore {
  return {
    get: async (name) => {
      const value: unknown = await transaction("readonly", (s) => s.get(name));
      // Not instanceof: a stored value may come from another realm (jsdom).
      return ArrayBuffer.isView(value)
        ? new Uint8Array(value.buffer, value.byteOffset, value.byteLength)
        : null;
    },
    set: async (name, bytes) => {
      await transaction("readwrite", (s) => s.put(bytes.slice(), name));
    },
    delete: async (name) => {
      await transaction("readwrite", (s) => s.delete(name));
    },
    clear: async () => {
      await transaction("readwrite", (s) => s.clear());
    },
  };
}
