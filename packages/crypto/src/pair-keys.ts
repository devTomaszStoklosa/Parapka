import type { KeyPair, Sodium } from "./sodium.js";

const KEY_LENGTH = 32;

/** The inviter is the `crypto_kx` server, the acceptor the client (spec 7.3 step 4). */
export type PairRole = "inviter" | "acceptor";

/** Directional keys of a pair: what this side sends with and receives with. */
export interface PairKeys {
  readonly sendKey: Uint8Array;
  readonly receiveKey: Uint8Array;
}

function checkLength(bytes: Uint8Array, name: string): void {
  if (bytes.length !== KEY_LENGTH) {
    throw new Error(`Invalid ${name} length`);
  }
}

/** The send key of one side equals the receive key of the other. */
export function derivePairKeys(
  sodium: Sodium,
  role: PairRole,
  ownAgreement: KeyPair,
  peerAgreementPublicKey: Uint8Array,
): PairKeys {
  checkLength(ownAgreement.publicKey, "own agreement public key");
  checkLength(ownAgreement.privateKey, "own agreement private key");
  checkLength(peerAgreementPublicKey, "peer agreement public key");
  const keys =
    role === "inviter"
      ? sodium.kxServerSessionKeys(
          ownAgreement.publicKey,
          ownAgreement.privateKey,
          peerAgreementPublicKey,
        )
      : sodium.kxClientSessionKeys(
          ownAgreement.publicKey,
          ownAgreement.privateKey,
          peerAgreementPublicKey,
        );
  return { sendKey: keys.sharedTx, receiveKey: keys.sharedRx };
}
