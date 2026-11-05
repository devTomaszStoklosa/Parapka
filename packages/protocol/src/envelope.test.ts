import { describe, expect, it } from "vitest";
import { validateEnvelope } from "./envelope.js";
import { MAX_ENVELOPE_BYTES } from "./limits.js";

const valid = {
  envelopeId: "0190-envelope",
  pairMailboxId: "mailbox",
  senderDeviceId: "device",
  protocolVersion: 1,
  nonce: "AAECAwQFBgcICQoLDA0ODxAREhMUFRYX",
  ciphertext: "aGVsbG8=",
};

function errorFields(input: unknown): string[] {
  const result = validateEnvelope(input);
  return result.ok ? [] : result.errors.map((error) => error.field);
}

describe("validateEnvelope", () => {
  it("accepts a valid envelope", () => {
    const result = validateEnvelope(valid);
    expect(result).toEqual({ ok: true, value: valid });
  });

  it("rejects a non-object", () => {
    expect(errorFields(null)).toEqual(["envelope"]);
    expect(errorFields([])).toEqual(["envelope"]);
    expect(errorFields("x")).toEqual(["envelope"]);
  });

  it("names every missing field", () => {
    expect(errorFields({})).toEqual([
      "envelopeId",
      "pairMailboxId",
      "senderDeviceId",
      "protocolVersion",
      "nonce",
      "ciphertext",
    ]);
  });

  it("names a field of the wrong type", () => {
    expect(errorFields({ ...valid, envelopeId: 5 })).toEqual(["envelopeId"]);
    expect(errorFields({ ...valid, protocolVersion: "1" })).toEqual([
      "protocolVersion",
    ]);
    expect(errorFields({ ...valid, protocolVersion: 1.5 })).toEqual([
      "protocolVersion",
    ]);
    expect(errorFields({ ...valid, senderDeviceId: "" })).toEqual([
      "senderDeviceId",
    ]);
  });

  it("rejects invalid base64", () => {
    expect(errorFields({ ...valid, nonce: "not base64!" })).toEqual(["nonce"]);
    expect(errorFields({ ...valid, ciphertext: "abc" })).toEqual([
      "ciphertext",
    ]);
    expect(errorFields({ ...valid, ciphertext: "ab=c" })).toEqual([
      "ciphertext",
    ]);
    expect(errorFields({ ...valid, ciphertext: "" })).toEqual(["ciphertext"]);
    expect(errorFields({ ...valid, nonce: 7 })).toEqual(["nonce"]);
  });

  it("rejects an envelope above 64 KB", () => {
    const ciphertext = "A".repeat(MAX_ENVELOPE_BYTES);
    expect(errorFields({ ...valid, ciphertext })).toEqual(["envelope"]);
  });

  it("measures the size in UTF-8 bytes", () => {
    const base = JSON.stringify({ ...valid, extra: "" }).length;
    // 2-byte characters: below the limit by character count, above by bytes.
    const extra = "ą".repeat(Math.ceil((MAX_ENVELOPE_BYTES - base) / 2) + 1);
    expect(extra.length + base).toBeLessThan(MAX_ENVELOPE_BYTES);
    expect(errorFields({ ...valid, extra })).toEqual(["envelope"]);
  });

  it("keeps unknown fields through a read and write", () => {
    const input = { ...valid, future: { a: [1, 2] }, flag: true };
    const first = validateEnvelope(input);
    if (!first.ok) throw new Error("expected a valid envelope");
    const second = validateEnvelope(JSON.parse(JSON.stringify(first.value)));
    expect(second).toEqual({ ok: true, value: input });
  });

  it("keeps a __proto__ field as an own property", () => {
    const input = JSON.parse(`{"__proto__": {"x": 1}}`) as Record<
      string,
      unknown
    >;
    const result = validateEnvelope({ ...valid, ...input });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(Object.getPrototypeOf(result.value)).toBe(Object.prototype);
    }
  });
});
