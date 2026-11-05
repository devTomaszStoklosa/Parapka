export interface ValidationError {
  /** Path of the offending field, for example `changes[0].hlc`. */
  readonly field: string;
  readonly message: string;
}

export type ValidationResult<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly errors: readonly ValidationError[] };

export type PlainObject = Record<string, unknown>;

export function isPlainObject(value: unknown): value is PlainObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function hasOwn(target: object, name: string): boolean {
  return Object.prototype.hasOwnProperty.call(target, name);
}

export function setOwn(
  target: PlainObject,
  name: string,
  value: unknown,
): void {
  // Plain assignment of "__proto__" would replace the prototype, not add a field.
  Object.defineProperty(target, name, {
    value,
    enumerable: true,
    writable: true,
    configurable: true,
  });
}

/** Shallow copy that keeps every own field, known or not (NFR-SYNC-05). */
export function copyFields(source: PlainObject): PlainObject {
  const copy: PlainObject = {};
  for (const name of Object.keys(source)) {
    setOwn(copy, name, source[name]);
  }
  return copy;
}

export function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}

/** Standard base64 alphabet with padding, not empty. */
export function isBase64(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.length > 0 &&
    value.length % 4 === 0 &&
    /^[A-Za-z0-9+/]*={0,2}$/.test(value)
  );
}

/** Object being validated, the prefix of its field paths and the error list. */
export interface Scope {
  readonly source: PlainObject;
  readonly prefix: string;
  readonly errors: ValidationError[];
}

/** Checks a required field; pushes an error with the field path. */
export function requireField(
  scope: Scope,
  name: string,
  check: (value: unknown) => boolean,
  expected: string,
): void {
  const field = scope.prefix + name;
  if (!hasOwn(scope.source, name)) {
    scope.errors.push({ field, message: "is required" });
  } else if (!check(scope.source[name])) {
    scope.errors.push({ field, message: `must be ${expected}` });
  }
}

export function utf8ByteLength(text: string): number {
  let bytes = 0;
  for (const char of text) {
    const code = char.codePointAt(0) as number;
    bytes += code < 0x80 ? 1 : code < 0x800 ? 2 : code < 0x10000 ? 3 : 4;
  }
  return bytes;
}
