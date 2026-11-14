import { type Hlc, compareHlc, parseHlc } from "./hlc.js";

/**
 * Entities edited by both people (spec 7.5), and the `Hint`: one author (the
 * generator), a new version for the same date replaces the previous one.
 */
export type MergeEntity =
  "Chore" | "MentalLoadItem" | "CoupleSettings" | "Hint";

/** Value of one field with the HLC (text form) of the change that set it. */
export interface FieldValue {
  readonly value: unknown;
  readonly hlc: string;
}

export interface UpsertChange {
  readonly entity: MergeEntity;
  readonly id: string;
  readonly op: "upsert";
  readonly fields: Readonly<Record<string, FieldValue>>;
}

export interface DeleteChange {
  readonly entity: MergeEntity;
  readonly id: string;
  readonly op: "delete";
  readonly hlc: string;
}

/** Explicit undo of a deletion; an edit never revives an entity (spec 7.5). */
export interface RestoreChange {
  readonly entity: MergeEntity;
  readonly id: string;
  readonly op: "restore";
  readonly hlc: string;
}

export type Change = UpsertChange | DeleteChange | RestoreChange;

/** Merged state of one entity; every part is a maximum, so merging commutes. */
export interface EntityState {
  readonly entity: MergeEntity;
  readonly id: string;
  readonly fields: Readonly<Record<string, FieldValue>>;
  /** Greatest HLC of a delete (the tombstone), if any. */
  readonly deletedAt: string | null;
  /** Greatest HLC of a restore, if any. */
  readonly restoredAt: string | null;
}

export function emptyEntityState(entity: MergeEntity, id: string): EntityState {
  return { entity, id, fields: {}, deletedAt: null, restoredAt: null };
}

/** True unless a tombstone exists that no later restore has overridden. */
export function isAlive(state: EntityState): boolean {
  if (state.deletedAt === null) return true;
  if (state.restoredAt === null) return false;
  return compareHlc(parseHlc(state.restoredAt), parseHlc(state.deletedAt)) > 0;
}

/** Plain values of the fields, or null when the entity is deleted. */
export function entityValues(
  state: EntityState,
): Record<string, unknown> | null {
  if (!isAlive(state)) return null;
  const values: Record<string, unknown> = {};
  for (const [name, field] of Object.entries(state.fields)) {
    setOwn(values, name, field.value);
  }
  return values;
}

function setOwn<T>(target: Record<string, T>, name: string, value: T): void {
  // Plain assignment of "__proto__" would replace the prototype, not add a field.
  Object.defineProperty(target, name, {
    value,
    enumerable: true,
    writable: true,
    configurable: true,
  });
}

function getOwn<T>(
  source: Readonly<Record<string, T>>,
  name: string,
): T | undefined {
  return Object.prototype.hasOwnProperty.call(source, name)
    ? source[name]
    : undefined;
}

function maxHlc(current: string | null, incoming: string): string {
  const next: Hlc = parseHlc(incoming);
  if (current === null) return incoming;
  return compareHlc(parseHlc(current), next) >= 0 ? current : incoming;
}

function stableJson(value: unknown): string {
  const json = JSON.stringify(value) as string | undefined;
  return json ?? "undefined";
}

function pickField(
  current: FieldValue | undefined,
  incoming: FieldValue,
): FieldValue {
  const incomingHlc = parseHlc(incoming.hlc);
  if (current === undefined) return incoming;
  const order = compareHlc(parseHlc(current.hlc), incomingHlc);
  if (order !== 0) return order > 0 ? current : incoming;
  // Same HLC with different values cannot come from one device; stay deterministic anyway.
  return stableJson(current.value) >= stableJson(incoming.value)
    ? current
    : incoming;
}

/** Applies one change; the result is independent of order and repeats. */
export function applyChange(state: EntityState, change: Change): EntityState {
  if (change.entity !== state.entity || change.id !== state.id) {
    throw new TypeError("Change does not belong to this entity");
  }
  switch (change.op) {
    case "upsert": {
      const fields: Record<string, FieldValue> = { ...state.fields };
      for (const [name, incoming] of Object.entries(change.fields)) {
        setOwn(fields, name, pickField(getOwn(fields, name), incoming));
      }
      return { ...state, fields };
    }
    case "delete":
      return { ...state, deletedAt: maxHlc(state.deletedAt, change.hlc) };
    case "restore":
      return { ...state, restoredAt: maxHlc(state.restoredAt, change.hlc) };
  }
}
