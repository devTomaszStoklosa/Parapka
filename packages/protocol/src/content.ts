import { SUPPORTED_SCHEMA_VERSION } from "./limits.js";
import {
  type PlainObject,
  type Scope,
  type ValidationError,
  copyFields,
  hasOwn,
  isNonEmptyString,
  isPlainObject,
  requireField,
  setOwn,
} from "./validation.js";

/** Value of one field with the HLC (text form) of the change that set it. */
export interface ContentFieldValue {
  readonly value: unknown;
  readonly hlc: string;
  readonly [unknown: string]: unknown;
}

/** Same shape as `Change` in `@parapka/sync`, but the entity is any text, so
 * an entity unknown to this version passes through. */
export interface ContentUpsert {
  readonly entity: string;
  readonly id: string;
  readonly op: "upsert";
  readonly fields: Readonly<Record<string, ContentFieldValue>>;
  readonly [unknown: string]: unknown;
}

export interface ContentDelete {
  readonly entity: string;
  readonly id: string;
  readonly op: "delete";
  readonly hlc: string;
  readonly [unknown: string]: unknown;
}

/** Explicit undo of a deletion (spec 7.5). */
export interface ContentRestore {
  readonly entity: string;
  readonly id: string;
  readonly op: "restore";
  readonly hlc: string;
  readonly [unknown: string]: unknown;
}

export type ContentChange = ContentUpsert | ContentDelete | ContentRestore;

/** Content of an envelope after decryption (spec 7.4). */
export interface EnvelopeContent {
  readonly schemaVersion: number;
  readonly changes: readonly ContentChange[];
  readonly [unknown: string]: unknown;
}

export type ContentValidation =
  | {
      readonly ok: true;
      readonly status: "current";
      readonly value: EnvelopeContent;
    }
  /** Newer schema than supported: the app must be updated, this is no error. */
  | {
      readonly ok: true;
      readonly status: "needs-update";
      readonly schemaVersion: number;
    }
  | { readonly ok: false; readonly errors: readonly ValidationError[] };

const isSchemaVersion = (value: unknown): boolean =>
  typeof value === "number" && Number.isInteger(value) && value >= 1;

export function validateContent(input: unknown): ContentValidation {
  if (!isPlainObject(input)) {
    return {
      ok: false,
      errors: [{ field: "content", message: "must be an object" }],
    };
  }
  const errors: ValidationError[] = [];
  const scope: Scope = { source: input, prefix: "", errors };
  requireField(scope, "schemaVersion", isSchemaVersion, "a positive integer");
  if (errors.length > 0) return { ok: false, errors };
  const schemaVersion = input["schemaVersion"] as number;
  // The shape of a future schema is unknown, so it is not checked further.
  if (schemaVersion > SUPPORTED_SCHEMA_VERSION) {
    return { ok: true, status: "needs-update", schemaVersion };
  }
  const changes = input["changes"];
  if (!hasOwn(input, "changes")) {
    errors.push({ field: "changes", message: "is required" });
  } else if (!Array.isArray(changes)) {
    errors.push({ field: "changes", message: "must be an array" });
  } else {
    const copies = changes.map((change: unknown, index) =>
      validateChange(change, `changes[${String(index)}]`, errors),
    );
    if (errors.length === 0) {
      const value = copyFields(input);
      setOwn(value, "changes", copies);
      return {
        ok: true,
        status: "current",
        value: value as unknown as EnvelopeContent,
      };
    }
  }
  return { ok: false, errors };
}

function validateChange(
  input: unknown,
  path: string,
  errors: ValidationError[],
): PlainObject {
  if (!isPlainObject(input)) {
    errors.push({ field: path, message: "must be an object" });
    return {};
  }
  const scope: Scope = { source: input, prefix: `${path}.`, errors };
  const text = "a non-empty string";
  requireField(scope, "entity", isNonEmptyString, text);
  requireField(scope, "id", isNonEmptyString, text);
  const op = input["op"];
  const copy = copyFields(input);
  if (op === "upsert") {
    const fields = validateFields(scope);
    if (fields !== undefined) setOwn(copy, "fields", fields);
  } else if (op === "delete" || op === "restore") {
    requireField(scope, "hlc", isNonEmptyString, text);
  } else {
    errors.push({
      field: `${path}.op`,
      message: hasOwn(input, "op")
        ? 'must be "upsert", "delete" or "restore"'
        : "is required",
    });
  }
  return copy;
}

function validateFields(scope: Scope): PlainObject | undefined {
  const { source, prefix, errors } = scope;
  const fields = source["fields"];
  if (!hasOwn(source, "fields")) {
    errors.push({ field: `${prefix}fields`, message: "is required" });
  } else if (!isPlainObject(fields)) {
    errors.push({ field: `${prefix}fields`, message: "must be an object" });
  } else {
    const copies: PlainObject = {};
    for (const name of Object.keys(fields)) {
      setOwn(
        copies,
        name,
        validateFieldValue(fields[name], `${prefix}fields.${name}`, errors),
      );
    }
    return copies;
  }
  return undefined;
}

function validateFieldValue(
  input: unknown,
  path: string,
  errors: ValidationError[],
): unknown {
  if (!isPlainObject(input)) {
    errors.push({ field: path, message: "must be an object" });
    return input;
  }
  if (!hasOwn(input, "value"))
    errors.push({ field: `${path}.value`, message: "is required" });
  requireField(
    { source: input, prefix: `${path}.`, errors },
    "hlc",
    isNonEmptyString,
    "a non-empty string",
  );
  return copyFields(input);
}
