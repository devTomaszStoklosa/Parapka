import { describe, expect, it } from "vitest";
import {
  ENVELOPE_TTL_DAYS,
  ENVELOPE_TTL_MS,
  MAX_ENVELOPE_BYTES,
  PROTOCOL_VERSION,
  SUPPORTED_SCHEMA_VERSION,
} from "./limits.js";

describe("limits", () => {
  it("allows an envelope of 64 KB", () => {
    expect(MAX_ENVELOPE_BYTES).toBe(65536);
  });

  it("keeps undelivered envelopes for 30 days", () => {
    expect(ENVELOPE_TTL_DAYS).toBe(30);
    expect(ENVELOPE_TTL_MS).toBe(30 * 24 * 60 * 60 * 1000);
  });

  it("starts at version 1", () => {
    expect(PROTOCOL_VERSION).toBe(1);
    expect(SUPPORTED_SCHEMA_VERSION).toBe(1);
  });
});
