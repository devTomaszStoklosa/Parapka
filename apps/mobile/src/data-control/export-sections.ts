import { isAlive, parseHlc, type EntityState } from "@parapka/sync";

import type { JsonValue, LocalDatabase } from "../data/local-database";

/** The device ids of the two people; they never reach the document. */
export interface Devices {
  readonly own: string | null;
  readonly partner: string | null;
}

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

/** The moment of an HLC (text form) as a date; the device in it is dropped. */
export const momentOf = (hlc: string) =>
  new Date(parseHlc(hlc).physical).toISOString();

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

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

/** An assignment with people ("me"/"partner") instead of device ids. */
export function personalAssignment(
  assignment: unknown,
  devices: Devices,
): JsonValue {
  if (!isObject(assignment)) return null;
  const { kind, deviceId, firstDeviceId, startDate } = assignment;
  if (kind === "person") {
    return { kind, person: personOf(String(deviceId), devices) };
  }
  if (kind === "alternating") {
    const firstPerson = personOf(String(firstDeviceId), devices);
    return { kind, firstPerson, startDate: startDate as string };
  }
  return { kind: kind as string };
}

/** The values of the records of a collection that are kept by their `id`. */
export async function plainValues(database: LocalDatabase, collection: string) {
  return (await database.list(collection)).map(({ value }) => value);
}
