import { isAlive, parseHlc, type EntityState } from "@parapka/sync";

import {
  decodeAssignment,
  type Devices,
  type StoredAssignment,
} from "../chores/chore-codec";
import type { JsonValue, LocalDatabase } from "../data/local-database";

export type { Devices };
export type Person = "me" | "partner";

/** A synced record as the repositories keep it. */
interface SyncedRecord {
  shared: boolean;
  state: EntityState;
  pending: { fields: object | null; life?: "delete" | "restore" | null };
}

export interface Row {
  readonly id: string;
  readonly shared: boolean;
  readonly values: Record<string, unknown>;
}

/** The person that a device id stands for; without an own id, any other is "me". */
export function personOf(deviceId: string, { own, partner }: Devices): Person {
  if (own !== null) return deviceId === own ? "me" : "partner";
  return deviceId === partner ? "partner" : "me";
}

/**
 * The moment of an HLC (text form) as a date; the device in it is dropped.
 * Null for a value that is no HLC: the partner's records are not trusted.
 */
export function momentOf(hlc: unknown): string | null {
  try {
    return new Date(parseHlc(String(hlc)).physical).toISOString();
  } catch {
    return null;
  }
}

/** The record that is not deleted, as its id and the values of its fields. */
function toRow(id: string, record: SyncedRecord): Row | null {
  const { state, pending } = record;
  const alive =
    pending.life == null ? isAlive(state) : pending.life === "restore";
  if (!alive) return null;
  const values: Record<string, unknown> = {};
  for (const [name, field] of Object.entries(state.fields)) {
    values[name] = field.value;
  }
  return {
    id,
    shared: record.shared,
    values: { ...values, ...pending.fields },
  };
}

/** The rows of a synced collection: merged state with `pending` on top, no HLC. */
export async function syncedRows(
  database: LocalDatabase,
  collection: string,
): Promise<Row[]> {
  const rows: Row[] = [];
  for (const { id, value } of await database.list(collection)) {
    const row = toRow(id, value as unknown as SyncedRecord);
    if (row !== null) rows.push(row);
  }
  return rows;
}

/** Only the named fields; a new field of a record is not exported by chance. */
export function pick(
  values: Record<string, unknown>,
  names: readonly string[],
): Record<string, JsonValue> {
  const picked: Record<string, JsonValue> = {};
  for (const name of names) {
    if (values[name] !== undefined) picked[name] = values[name] as JsonValue;
  }
  return picked;
}

/** An assignment with people ("me"/"partner") instead of device ids. */
export function personalAssignment(
  assignment: unknown,
  devices: Devices,
): JsonValue {
  if (typeof assignment !== "object" || assignment === null) return null;
  return decodeAssignment(assignment as StoredAssignment, devices);
}

/** The values of the records of a collection that are kept by their `id`. */
export async function plainValues(database: LocalDatabase, collection: string) {
  return (await database.list(collection)).map(({ value }) => value);
}
