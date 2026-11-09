import {
  base64urlDecode,
  base64urlEncode,
  computeSafetyCode,
  decryptAcceptorKeys,
  derivePairKeys,
  encodeInvitation,
  generateInvitationSecret,
  type DevicePublicKeys,
  type Sodium,
} from "@parapka/crypto";
import type { Clock } from "@parapka/domain";

import type { FetchInvitationKeysResponse } from "@parapka/protocol";

import type { Identity } from "../identity/identity";
import type { DeviceCredentials, RelayClient } from "../net/relay-client";
import { RelayError } from "../net/relay-error";
import type { KeyStore } from "../platform/key-store";
import { buildInvitationLink } from "./invitation-link";
import type { PairRepository } from "./pair-repository";

// The private key stored by `identity.ts` (not exposed by `Identity`).
const AGREEMENT_KEY = "identity/agreement-private";

/** An invitation created by this device, shown as a link and a QR code. */
export interface ActiveInvitation {
  readonly invitationId: string;
  readonly secret: Uint8Array;
  readonly link: string;
  readonly expiresAtMs: number;
}

export type StartOutcome =
  | { readonly status: "created"; readonly invitation: ActiveInvitation }
  /** FR-PAIR-09: a person in a pair cannot invite; the relay is not called. */
  | { readonly status: "alreadyPaired" }
  | { readonly status: "offline" };

export type PollOutcome =
  | { readonly status: "waiting" }
  | { readonly status: "expired" }
  /** The keys of the partner do not decrypt: the relay or the partner is faulty. */
  | { readonly status: "invalid" }
  | { readonly status: "accepted"; readonly safetyCode: string };

export interface Inviter {
  start(): Promise<StartOutcome>;
  poll(invitation: ActiveInvitation): Promise<PollOutcome>;
  /** The code of the pair that waits for confirmation, or null. */
  pendingSafetyCode(): Promise<string | null>;
}

export interface InviterDeps {
  readonly sodium: Sodium;
  readonly keyStore: KeyStore;
  readonly clock: Clock;
  readonly identity: Identity;
  readonly pairs: PairRepository;
  /** A relay client that signs with the credentials of this device. */
  readonly relay: (
    credentials: DeviceCredentials,
  ) => Pick<RelayClient, "createInvitation" | "fetchInvitationKeys">;
  /** Address of the app, the base of the link. */
  readonly appUrl: string;
}

type KeysResponse = FetchInvitationKeysResponse;

/** `encryptedKeys` on the relay: base64url nonce, a dot, base64url ciphertext. */
function parseEncryptedKeys(text: string) {
  const parts = text.split(".");
  if (parts.length !== 2) throw new Error("Invalid encrypted keys");
  return {
    nonce: base64urlDecode(parts[0] as string),
    ciphertext: base64urlDecode(parts[1] as string),
  };
}

async function ownKeys(deps: InviterDeps) {
  const publicKeys = await deps.identity.publicKeys();
  const privateKey = await deps.keyStore.get(AGREEMENT_KEY);
  if (!publicKeys || !privateKey) throw new Error("No device keys");
  return { publicKeys, privateKey };
}

async function relayFor(deps: InviterDeps) {
  const credentials = await deps.identity.credentials();
  if (!credentials) throw new Error("Device is not registered");
  return deps.relay(credentials);
}

async function start(deps: InviterDeps): Promise<StartOutcome> {
  if (await deps.pairs.get()) return { status: "alreadyPaired" };
  try {
    if ((await deps.identity.ensureRegistered()) !== "registered") {
      return { status: "offline" };
    }
    const { publicKeys } = await ownKeys(deps);
    const { invitationId, expiresAt } = await (
      await relayFor(deps)
    ).createInvitation();
    const secret = generateInvitationSecret(deps.sodium);
    const text = encodeInvitation({ invitationId, publicKeys, secret });
    return {
      status: "created",
      invitation: {
        invitationId,
        secret,
        link: buildInvitationLink(deps.appUrl, text),
        expiresAtMs: Date.parse(expiresAt),
      },
    };
  } catch (error) {
    if (error instanceof RelayError && error.kind === "network") {
      return { status: "offline" };
    }
    throw error;
  }
}

/** The keys of the partner, or a status when they are not available yet. */
async function fetchPartnerKeys(
  deps: InviterDeps,
  invitation: ActiveInvitation,
): Promise<
  | { readonly partner: DevicePublicKeys; readonly response: KeysResponse }
  | PollOutcome
> {
  let response: KeysResponse;
  try {
    response = await (
      await relayFor(deps)
    ).fetchInvitationKeys(invitation.invitationId);
  } catch (error) {
    if (error instanceof RelayError) {
      if (error.kind === "expired") return { status: "expired" };
      // 404 until the partner accepts; a network error is retried too.
      if (error.kind === "notFound" || error.kind === "network") {
        return { status: "waiting" };
      }
    }
    throw error;
  }
  try {
    const partner = decryptAcceptorKeys(
      deps.sodium,
      invitation.secret,
      invitation.invitationId,
      parseEncryptedKeys(response.encryptedKeys),
    );
    return { partner, response };
  } catch {
    return { status: "invalid" };
  }
}

async function poll(
  deps: InviterDeps,
  invitation: ActiveInvitation,
): Promise<PollOutcome> {
  if (deps.clock.nowMs() >= invitation.expiresAtMs) {
    return { status: "expired" };
  }
  const fetched = await fetchPartnerKeys(deps, invitation);
  if ("status" in fetched) return fetched;
  const { partner, response } = fetched;
  const own = await ownKeys(deps);
  const keys = derivePairKeys(
    deps.sodium,
    "inviter",
    { publicKey: own.publicKeys.agreement, privateKey: own.privateKey },
    partner.agreement,
  );
  await deps.pairs.savePending(
    {
      pairMailboxId: response.pairMailboxId,
      partnerDeviceId: response.acceptedByDeviceId,
      partnerSigningPublicKey: base64urlEncode(partner.signing),
      partnerAgreementPublicKey: base64urlEncode(partner.agreement),
    },
    keys,
  );
  return {
    status: "accepted",
    safetyCode: computeSafetyCode(deps.sodium, own.publicKeys, partner),
  };
}

async function pendingSafetyCode(deps: InviterDeps): Promise<string | null> {
  const record = await deps.pairs.get();
  if (record?.state !== "pending-confirmation") return null;
  const { publicKeys } = await ownKeys(deps);
  return computeSafetyCode(deps.sodium, publicKeys, {
    signing: base64urlDecode(record.partnerSigningPublicKey),
    agreement: base64urlDecode(record.partnerAgreementPublicKey),
  });
}

export function createInviter(deps: InviterDeps): Inviter {
  return {
    start: () => start(deps),
    poll: (invitation) => poll(deps, invitation),
    pendingSafetyCode: () => pendingSafetyCode(deps),
  };
}
