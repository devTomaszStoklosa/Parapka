import { describe, expect, it } from "vitest";
import { RETENTION_MS, purgeTechnicalData } from "./retention.js";
import { MemoryStore } from "./store/memory-store.js";

describe("purgeTechnicalData", () => {
  it("deletes challenges and invitations older than 14 days", async () => {
    const store = new MemoryStore();
    const start = 1_700_000_000_000;
    await store.putChallenge({
      challengeId: "c1",
      deviceId: "d1",
      nonce: "n",
      expiresAtMs: start + 5 * 60 * 1000,
    });
    await store.putInvitation({
      invitationId: "i1",
      deviceId: "d1",
      expiresAtMs: start + 24 * 60 * 60 * 1000,
      acceptedByDeviceId: null,
      encryptedKeysB: null,
    });
    await store.putChallenge({
      challengeId: "fresh",
      deviceId: "d1",
      nonce: "n",
      expiresAtMs: start + RETENTION_MS + 60_000,
    });

    await purgeTechnicalData(store, { nowMs: () => start + RETENTION_MS });

    expect(await store.takeChallenge("c1")).toBeNull();
    expect(await store.getInvitation("i1")).toBeNull();
    expect(await store.takeChallenge("fresh")).not.toBeNull();
  });
});
