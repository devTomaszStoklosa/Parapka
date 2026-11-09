export type JsonValue =
  string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue };

export interface DatabaseRecord {
  id: string;
  value: JsonValue;
}

/**
 * Local store of JSON records grouped in collections (spec 7.2, layer `data`).
 * Values are copied on write and on read.
 */
export interface LocalDatabase {
  /** The value stored under `id`, or null when there is none. */
  get(collection: string, id: string): Promise<JsonValue | null>;
  put(collection: string, id: string, value: JsonValue): Promise<void>;
  delete(collection: string, id: string): Promise<void>;
  /** All records of the collection, ordered by `id`. */
  list(collection: string): Promise<DatabaseRecord[]>;
  /** Removes all data (FR-SEC-04). */
  clear(): Promise<void>;
}
