import { decryptEnvelope, type Sodium } from "@parapka/crypto";
import type { Envelope } from "@parapka/protocol";

import { base64Decode } from "../sync/base64";
import { keys } from "../sync/wiring-test-support";

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
