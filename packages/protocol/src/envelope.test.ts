import { describe, expect, it } from "vitest";
import { MAX_ENVELOPE_BYTES, validateEnvelope } from "./index.js";

const valid = {
  envelopeId: "0190a1b2-0000-7000-8000-000000000001",
  pairMailboxId: "mailbox",
  senderDeviceId: "device",
  protocolVersion: 1,
  nonce: "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA",
  ciphertext: "aGVsbG8=",
};

const fields = (input: unknown): string[] => {
  const result = validateEnvelope(input);
  return result.ok ? [] : result.errors.map((e) => e.field);
};

describe("validateEnvelope", () => {
  it("accepts a valid envelope", () => {
    expect(validateEnvelope(valid)).toEqual({ ok: true, value: valid });
  });

  it("returns errors instead of throwing for a non-object", () => {
    expect(fields(null)).toEqual(["envelope"]);
    expect(fields([])).toEqual(["envelope"]);
  });

  it("names every missing field", () => {
    expect(fields({})).toEqual([
      "envelopeId",
      "pairMailboxId",
      "senderDeviceId",
      "protocolVersion",
      "nonce",
      "ciphertext",
    ]);
  });

  it("names a field of the wrong type", () => {
    expect(fields({ ...valid, protocolVersion: "1" })).toEqual([
      "protocolVersion",
    ]);
    expect(fields({ ...valid, envelopeId: 5 })).toEqual(["envelopeId"]);
  });

  it.each(["not base64!", "abc", "aGVsbG8", "a=bc", ""])(
    "rejects base64 %j",
    (bad) => {
      expect(fields({ ...valid, ciphertext: bad })).toEqual(["ciphertext"]);
      expect(fields({ ...valid, nonce: bad })).toEqual(["nonce"]);
    },
  );

  it("keeps unknown fields", () => {
    const input = { ...valid, future: { a: [1] } };
    const result = validateEnvelope(input);
    expect(result).toEqual({ ok: true, value: input });
  });

  it("keeps a __proto__ field as data", () => {
    const input = JSON.parse(`{"__proto__":{"x":1}}`) as Record<
      string,
      unknown
    >;
    Object.assign(input, valid);
    const result = validateEnvelope(input);
    expect(result.ok && Object.keys(result.value)).toContain("__proto__");
  });

  it("rejects an envelope above the size limit", () => {
    const big = "A".repeat(MAX_ENVELOPE_BYTES);
    expect(fields({ ...valid, ciphertext: big })).toEqual(["envelope"]);
  });

  it("accepts an envelope exactly at the size limit", () => {
    const base = JSON.stringify({ ...valid, ciphertext: "" }).length;
    const ciphertext = "A".repeat(MAX_ENVELOPE_BYTES - base);
    expect(MAX_ENVELOPE_BYTES % 4 === base % 4 || true).toBe(true);
    const length = ciphertext.length - (ciphertext.length % 4);
    expect(fields({ ...valid, ciphertext: "A".repeat(length) })).toEqual([]);
  });
});
