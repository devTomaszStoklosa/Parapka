/** A JSON value; records are stored as JSON (spec 7.2, layer `data`). */
export type JsonValue =
  string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue };

export interface LocalRecord {
  readonly id: string;
  readonly value: JsonValue;
}

/** Local store of JSON records grouped in collections. */
export interface LocalDatabase {
  /** The value stored under `id`, or null when there is none. */
  get(collection: string, id: string): Promise<JsonValue | null>;
  put(collection: string, id: string, value: JsonValue): Promise<void>;
  delete(collection: string, id: string): Promise<void>;
  /** All records of the collection, ordered by `id`. */
  list(collection: string): Promise<LocalRecord[]>;
  /** Removes all data, the schema version and the database key. */
  clear(): Promise<void>;
}
