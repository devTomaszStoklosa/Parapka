import {
  base64urlDecode,
  computeSafetyCode,
  decryptAcceptorKeys,
  derivePairKeys,
  encodeDevicePublicKeys,
  encodeInvitation,
  generateInvitationSecret,
  type DevicePublicKeys,
  type Sodium,
} from "@parapka/crypto";
import type { Clock } from "@parapka/domain";

import type { Identity } from "../identity/identity";
import type { RelayClient } from "../net/relay-client";
import { RelayError } from "../net/relay-error";
import { invitationLink } from "./invitation-link";
import type { PairRepository } from "./pair-repository";

export interface InviterDeps {
  readonly sodium: Sodium;
  readonly relay: Pick<RelayClient, "createInvitation" | "fetchInvitationKeys">;
  readonly identity: Identity;
  readonly pairs: PairRepository;
  readonly clock: Clock;
  /** The address the link opens, e.g. `https://app.example`. */
  readonly appUrl: string;
}

export type CreateResult =
  | {
      readonly status: "created";
      readonly link: string;
      readonly invitationId: string;
      /** Milliseconds since the Unix epoch. */
      readonly expiresAt: number;
    }
  /** A person with any pair cannot invite (FR-PAIR-09). */
  | { readonly status: "already-paired" }
  | { readonly status: "offline" };

export type PollResult =
  | { readonly status: "waiting" }
  | { readonly status: "accepted"; readonly safetyCode: string }
  | { readonly status: "expired" }
  | { readonly status: "offline" }
  | { readonly status: "invalid" };

export interface Inviter {
  create(): Promise<CreateResult>;
  /** Asks the relay whether B accepted; on acceptance saves the pair as `pending-confirmation`. */
  poll(): Promise<PollResult>;
  /** After the codes match on both phones. */
  confirm(): Promise<void>;
  /** The codes differ: removes the pair and its keys. */
  reject(): Promise<void>;
}

interface Sent {
  readonly invitationId: string;
  readonly secret: Uint8Array;
  readonly expiresAt: number;
}

type KeysResponse = Awaited<ReturnType<RelayClient["fetchInvitationKeys"]>>;

/** B's public keys, or null when `encryptedKeys` has a wrong shape or does not decrypt. */
function decryptPeer(
  sodium: Sodium,
  invitation: Sent,
  encryptedKeys: string,
): DevicePublicKeys | null {
  // The text is `<base64url nonce>.<base64url ciphertext>`.
  const parts = encryptedKeys.split(".");
  if (parts.length !== 2) return null;
  try {
    return decryptAcceptorKeys(
      sodium,
      invitation.secret,
      invitation.invitationId,
      {
        nonce: base64urlDecode(parts[0] as string),
        ciphertext: base64urlDecode(parts[1] as string),
      },
    );
  } catch {
    return null;
  }
}

async function savePair(
  deps: InviterDeps,
  invitation: Sent,
  response: KeysResponse,
): Promise<PollResult> {
  const { sodium, identity, pairs } = deps;
  const peer = decryptPeer(sodium, invitation, response.encryptedKeys);
  if (!peer) return { status: "invalid" };
  const own = await identity.publicKeys();
  const agreement = await identity.agreementKeyPair();
  if (!own || !agreement) throw new Error("The device has no keys");
  const keys = derivePairKeys(sodium, "inviter", agreement, peer.agreement);
  const text = encodeDevicePublicKeys(peer);
  await pairs.savePending(
    {
      pairMailboxId: response.pairMailboxId,
      deviceId: response.acceptedByDeviceId,
      signingPublicKey: text.signing,
      agreementPublicKey: text.agreement,
    },
    keys,
  );
  return {
    status: "accepted",
    safetyCode: computeSafetyCode(sodium, own, peer),
  };
}

/** Maps the failures the screens handle; anything else is a bug and goes on. */
function pollFailure(error: unknown): PollResult {
  if (error instanceof RelayError) {
    if (error.kind === "notFound") return { status: "waiting" };
    if (error.kind === "expired") return { status: "expired" };
    if (error.kind === "network") return { status: "offline" };
  }
  throw error;
}

async function createInvitation(
  deps: InviterDeps,
): Promise<{ result: CreateResult; sent: Sent | null }> {
  const { sodium, relay, identity, pairs } = deps;
  if ((await pairs.current()) !== null) {
    return { result: { status: "already-paired" }, sent: null };
  }
  const publicKeys = await identity.publicKeys();
  if (!publicKeys) throw new Error("The device has no keys");
  try {
    const { invitationId, expiresAt } = await relay.createInvitation();
    const secret = generateInvitationSecret(sodium);
    const text = encodeInvitation({ invitationId, publicKeys, secret });
    const expires = Date.parse(expiresAt);
    return {
      result: {
        status: "created",
        link: invitationLink(deps.appUrl, text),
        invitationId,
        expiresAt: expires,
      },
      sent: { invitationId, secret, expiresAt: expires },
    };
  } catch (error) {
    if (error instanceof RelayError && error.kind === "network") {
      return { result: { status: "offline" }, sent: null };
    }
    throw error;
  }
}

export function createInviter(deps: InviterDeps): Inviter {
  const { relay, pairs, clock } = deps;
  let sent: Sent | null = null;

  const poll = async (invitation: Sent): Promise<PollResult> => {
    try {
      const response = await relay.fetchInvitationKeys(invitation.invitationId);
      return await savePair(deps, invitation, response);
    } catch (error) {
      return pollFailure(error);
    }
  };

  return {
    create: async () => {
      const created = await createInvitation(deps);
      sent = created.sent;
      return created.result;
    },
    poll: async () => {
      if (!sent || clock.nowMs() > sent.expiresAt) {
        sent = null;
        return { status: "expired" };
      }
      const result = await poll(sent);
      // The invitation is one-time: only waiting and a lost network retry it.
      if (result.status !== "waiting" && result.status !== "offline") {
        sent = null;
      }
      return result;
    },
    confirm: () => pairs.confirm(),
    reject: () => pairs.remove(),
  };
}
