import type { JsonValue, LocalDatabase } from "./local-database";

const copy = (value: JsonValue): JsonValue =>
  JSON.parse(JSON.stringify(value)) as JsonValue;

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
      const records = [...(collections.get(collection) ?? [])];
      return Promise.resolve(
        records
          .sort(([a], [b]) => (a < b ? -1 : 1))
          .map(([id, value]) => ({ id, value: copy(value) })),
      );
    },
    clear: () => {
      collections.clear();
      return Promise.resolve();
    },
  };
}
