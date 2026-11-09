import type { JsonValue, LocalDatabase } from "./local-database";

function copy(value: JsonValue): JsonValue {
  return JSON.parse(JSON.stringify(value)) as JsonValue;
}

/** LocalDatabase held in memory, for tests. */
export function createMemoryDatabase(): LocalDatabase {
  const collections = new Map<string, Map<string, JsonValue>>();
  return {
    get: (collection, id) => {
      const value = collections.get(collection)?.get(id);
      return Promise.resolve(value === undefined ? null : copy(value));
    },
    put: (collection, id, value) => {
      const records =
        collections.get(collection) ?? new Map<string, JsonValue>();
      records.set(id, copy(value));
      collections.set(collection, records);
      return Promise.resolve();
    },
    delete: (collection, id) => {
      collections.get(collection)?.delete(id);
      return Promise.resolve();
    },
    list: (collection) => {
      const records =
        collections.get(collection) ?? new Map<string, JsonValue>();
      return Promise.resolve(
        [...records.keys()]
          .sort()
          .map((id) => ({ id, value: copy(records.get(id) as JsonValue) })),
      );
    },
    clear: () => {
      collections.clear();
      return Promise.resolve();
    },
  };
}
