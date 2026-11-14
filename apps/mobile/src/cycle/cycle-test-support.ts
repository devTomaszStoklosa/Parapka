import { decryptEnvelope, type Sodium } from "@parapka/crypto";
import type { Envelope } from "@parapka/protocol";

import { vi } from "vitest";

import { defaultConsent } from "../consent/consent-model";
import { createCycleSettingsRepository } from "../data/cycle-settings";
import { base64Decode } from "../sync/base64";
import { keys, profile, setup } from "../sync/wiring-test-support";
import { wireCycle } from "./wiring";

/**
 * The plaintext JSON of the envelopes that the device sent to the relay,
 * decrypted with the key of the pair. `bodies` are the request bodies that
 * `setup().postedBodies()` collects.
 */
export function decryptedEnvelopes(
  sodium: Sodium,
  bodies: readonly string[],
): string[] {
  return bodies.map((body) => {
    const { envelope } = JSON.parse(body) as { envelope: Envelope };
    const { nonce, ciphertext, ...fields } = envelope;
    const plaintext = decryptEnvelope(sodium, keys.sendKey, fields, {
      nonce: base64Decode(nonce),
      ciphertext: base64Decode(ciphertext),
    });
    return new TextDecoder().decode(plaintext);
  });
}

/** The stopped clock of the privacy tests: 2026-11-14. */
export const privacyClock = {
  nowMs: () => new Date(2026, 10, 14, 12).getTime(),
};

/**
 * A paired device with the cycle profile and the consent for the hints. Stubs
 * `localStorage`; the caller restores the globals.
 */
export async function setupCycleDevice() {
  const storage = { getItem: vi.fn(() => null), setItem: vi.fn() };
  vi.stubGlobal("localStorage", storage);
  const set = await setup();
  const cycleProfile = { ...profile, cycle: "yes" } as const;
  await set.profiles.save(cycleProfile);
  await createCycleSettingsRepository(set.platform.database).save({
    unknown: false,
    lastPeriodStart: "2026-09-03",
    cycleLength: 28,
    periodLength: 5,
  });
  await set.pair();
  await set.consent.save({
    ...defaultConsent(cycleProfile),
    CYCLE_HINTS: true,
  });
  return {
    set,
    storage,
    cycle: wireCycle({ ...set.platform, clock: privacyClock }),
  };
}
