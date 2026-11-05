import { SUPPORTED_SCHEMA_VERSION } from "./limits.js";
import {
  ErrorList,
  type PlainObject,
  type ValidationError,
  copyOwn,
  getOwn,
  isPlainObject,
  setOwn,
} from "./validation.js";

/** Value of one field with the HLC (text form) of the change that set it. */
export interface FieldValue {
  readonly value: unknown;
  readonly hlc: string;
}

/**
 * Same shape as `Change` in `@parapka/sync`, but `entity` is any text: the
 * content may name entities this version does not know (NFR-SYNC-05).
 */
export interface UpsertChange {
  readonly entity: string;
  readonly id: string;
  readonly op: "upsert";
  readonly fields: Readonly<Record<string, FieldValue>>;
}

export interface DeleteChange {
  readonly entity: string;
  readonly id: string;
  readonly op: "delete";
  readonly hlc: string;
}

/** Explicit undo of a deletion (spec 7.5). */
export interface RestoreChange {
  readonly entity: string;
  readonly id: string;
  readonly op: "restore";
  readonly hlc: string;
}

export type ContentChange = UpsertChange | DeleteChange | RestoreChange;

/**
 * Decrypted content of an envelope (spec 7.4). A validated value may carry
 * more fields than these; they are kept as is.
 */
export interface EnvelopeContent {
  readonly schemaVersion: number;
  readonly changes: readonly ContentChange[];
}

export type ContentResult =
  | {
      readonly ok: true;
      readonly status: "ok";
      readonly value: EnvelopeContent;
    }
  // The content comes from a newer schema: the app has to be updated.
  | {
      readonly ok: true;
      readonly status: "needs-update";
      readonly schemaVersion: number;
    }
  | { readonly ok: false; readonly errors: readonly ValidationError[] };

export function validateContent(input: unknown): ContentResult {
  if (!isPlainObject(input)) {
    return {
      ok: false,
      errors: [{ field: "content", message: "must be an object" }],
    };
  }
  const errors = new ErrorList();
  const schemaVersion = errors.positiveInteger(input, "schemaVersion");
  if (schemaVersion !== undefined && schemaVersion > SUPPORTED_SCHEMA_VERSION) {
    return { ok: true, status: "needs-update", schemaVersion };
  }
  const changes = getOwn(input, "changes");
  const checked: unknown[] = [];
  if (changes === undefined) {
    errors.add("changes", "is required");
  } else if (!Array.isArray(changes)) {
    errors.add("changes", "must be an array");
  } else {
    changes.forEach((change: unknown, index) => {
      checked.push(validateChange(change, `changes[${String(index)}]`, errors));
    });
  }
  if (errors.errors.length > 0) return { ok: false, errors: errors.errors };
  const value = copyOwn(input);
  setOwn(value, "changes", checked);
  return { ok: true, status: "ok", value: value as unknown as EnvelopeContent };
}

function validateChange(
  input: unknown,
  path: string,
  errors: ErrorList,
): unknown {
  if (!isPlainObject(input)) {
    errors.add(path, "must be an object");
    return input;
  }
  errors.text(input, "entity", `${path}.entity`);
  errors.text(input, "id", `${path}.id`);
  const op = getOwn(input, "op");
  if (op === "upsert") return validateUpsert(input, path, errors);
  if (op === "delete" || op === "restore") {
    errors.text(input, "hlc", `${path}.hlc`);
  } else if (op === undefined) {
    errors.add(`${path}.op`, "is required");
  } else {
    errors.add(`${path}.op`, "must be upsert, delete or restore");
  }
  return copyOwn(input);
}

function validateUpsert(
  input: PlainObject,
  path: string,
  errors: ErrorList,
): PlainObject {
  const copy = copyOwn(input);
  const fields = getOwn(input, "fields");
  if (fields === undefined) {
    errors.add(`${path}.fields`, "is required");
    return copy;
  }
  if (!isPlainObject(fields)) {
    errors.add(`${path}.fields`, "must be an object");
    return copy;
  }
  const fieldsCopy: PlainObject = {};
  for (const name of Object.keys(fields)) {
    const field = fields[name];
    const fieldPath = `${path}.fields.${name}`;
    if (!isPlainObject(field)) {
      errors.add(fieldPath, "must be an object");
      setOwn(fieldsCopy, name, field);
      continue;
    }
    if (!Object.hasOwn(field, "value")) {
      errors.add(`${fieldPath}.value`, "is required");
    }
    errors.text(field, "hlc", `${fieldPath}.hlc`);
    setOwn(fieldsCopy, name, copyOwn(field));
  }
  setOwn(copy, "fields", fieldsCopy);
  return copy;
}
