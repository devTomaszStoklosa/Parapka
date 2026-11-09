import type { KeyStore } from "./key-store";

/** KeyStore held in memory, for tests. */
export function createMemoryKeyStore(): KeyStore {
  const entries = new Map<string, Uint8Array>();
  return {
    get: (name) => {
      const bytes = entries.get(name);
      return Promise.resolve(bytes ? bytes.slice() : null);
    },
    set: (name, bytes) => {
      entries.set(name, bytes.slice());
      return Promise.resolve();
    },
    delete: (name) => {
      entries.delete(name);
      return Promise.resolve();
    },
    clear: () => {
      entries.clear();
      return Promise.resolve();
    },
  };
}
