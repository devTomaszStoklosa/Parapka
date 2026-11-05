import { describe, expect, it } from "vitest";
import {
  ENVELOPE_TTL_DAYS,
  ENVELOPE_TTL_MS,
  MAX_ENVELOPE_BYTES,
} from "./index.js";

describe("limits", () => {
  it("allows an envelope of at most 64 KB", () => {
    expect(MAX_ENVELOPE_BYTES).toBe(65536);
  });

  it("keeps undelivered envelopes for 30 days", () => {
    expect(ENVELOPE_TTL_DAYS).toBe(30);
    expect(ENVELOPE_TTL_MS).toBe(30 * 24 * 3600 * 1000);
  });
});
