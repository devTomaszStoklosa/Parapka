/** One problem found by a validator; `field` is a path such as `changes[0].hlc`. */
export interface ValidationError {
  readonly field: string;
  readonly message: string;
}

export type ValidationResult<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly errors: readonly ValidationError[] };

export type PlainObject = Record<string, unknown>;

const BASE64 =
  /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/;

export function isPlainObject(value: unknown): value is PlainObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}

export function isPositiveInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 1;
}

/** Standard base64 with padding; the empty string is not accepted. */
export function isBase64(value: unknown): value is string {
  return typeof value === "string" && value.length > 0 && BASE64.test(value);
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

/** Shallow copy of every own property, so unknown fields survive (NFR-SYNC-05). */
export function copyOwn(source: PlainObject): PlainObject {
  const copy: PlainObject = {};
  for (const name of Object.keys(source)) setOwn(copy, name, source[name]);
  return copy;
}

export function getOwn(source: PlainObject, name: string): unknown {
  return Object.hasOwn(source, name) ? source[name] : undefined;
}

/** Collects the errors of one validation run. */
export class ErrorList {
  readonly errors: ValidationError[] = [];

  add(field: string, message: string): void {
    this.errors.push({ field, message });
  }

  text(source: PlainObject, name: string, path = name): void {
    const value = getOwn(source, name);
    if (value === undefined) this.add(path, "is required");
    else if (!isNonEmptyString(value)) {
      this.add(path, "must be a non-empty string");
    }
  }

  base64(source: PlainObject, name: string): void {
    const value = getOwn(source, name);
    if (value === undefined) this.add(name, "is required");
    else if (!isBase64(value)) this.add(name, "must be non-empty base64");
  }

  positiveInteger(source: PlainObject, name: string): number | undefined {
    const value = getOwn(source, name);
    if (value === undefined) this.add(name, "is required");
    else if (!isPositiveInteger(value)) {
      this.add(name, "must be an integer of at least 1");
    } else {
      return value;
    }
    return undefined;
  }
}

/** Length of the UTF-8 encoding of a string, without TextEncoder. */
export function utf8Length(text: string): number {
  let bytes = 0;
  for (const char of text) {
    const code = char.codePointAt(0) ?? 0;
    bytes += code < 0x80 ? 1 : code < 0x800 ? 2 : code < 0x10000 ? 3 : 4;
  }
  return bytes;
}
