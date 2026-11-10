import {
  base64urlEncode,
  computeSafetyCode,
  decodeInvitation,
  derivePairKeys,
  encodeDevicePublicKeys,
  encryptAcceptorKeys,
  type InvitationPayload,
  type Sodium,
} from "@parapka/crypto";

import type { Identity } from "../identity/identity";
import type { RelayClient } from "../net/relay-client";
import { RelayError } from "../net/relay-error";
import { parseInvitationLink } from "./invitation-link";
import type { PairRepository } from "./pair-repository";

export interface AcceptorDeps {
  readonly sodium: Sodium;
  readonly relay: Pick<RelayClient, "acceptInvitation">;
  readonly identity: Identity;
  readonly pairs: PairRepository;
}

export type AcceptResult =
  | { readonly status: "accepted"; readonly safetyCode: string }
  /** The text is not an invitation, or its version is unknown. */
  | { readonly status: "invalid" }
  /** A person with any pair cannot accept (FR-PAIR-09). */
  | { readonly status: "already-paired" }
  /** The invitation is past its 24 h (FR-PAIR-01). */
  | { readonly status: "expired" }
  /** A is already paired with someone else. */
  | { readonly status: "inviter-paired" }
  | { readonly status: "offline" };

export interface Acceptor {
  /** Takes a full link or only the invitation text. */
  accept(linkOrText: string): Promise<AcceptResult>;
  /** After the codes match on both phones. */
  confirm(): Promise<void>;
  /** The codes differ: removes the pair and its keys. */
  reject(): Promise<void>;
}

function decode(linkOrText: string): InvitationPayload | null {
  try {
    return decodeInvitation(parseInvitationLink(linkOrText) ?? linkOrText);
  } catch {
    return null;
  }
}

/** Maps the failures the screens handle; anything else is a bug and goes on. */
function acceptFailure(error: unknown): AcceptResult {
  if (error instanceof RelayError) {
    if (error.kind === "expired") return { status: "expired" };
    if (error.kind === "conflict") return { status: "inviter-paired" };
    if (error.kind === "network") return { status: "offline" };
    if (error.kind === "notFound" || error.kind === "invalid") {
      return { status: "invalid" };
    }
  }
  throw error;
}

async function accept(
  deps: AcceptorDeps,
  invitation: InvitationPayload,
): Promise<AcceptResult> {
  const { sodium, relay, identity, pairs } = deps;
  const own = await identity.publicKeys();
  const agreement = await identity.agreementKeyPair();
  if (!own || !agreement) throw new Error("The device has no keys");
  const encrypted = encryptAcceptorKeys(
    sodium,
    invitation.secret,
    invitation.invitationId,
    own,
  );
  let pairMailboxId: string;
  try {
    ({ pairMailboxId } = await relay.acceptInvitation(
      invitation.invitationId,
      `${base64urlEncode(encrypted.nonce)}.${base64urlEncode(encrypted.ciphertext)}`,
    ));
  } catch (error) {
    return acceptFailure(error);
  }
  const keys = derivePairKeys(
    sodium,
    "acceptor",
    agreement,
    invitation.publicKeys.agreement,
  );
  const text = encodeDevicePublicKeys(invitation.publicKeys);
  await pairs.savePending(
    {
      pairMailboxId,
      // The invitation does not carry A's device id; sync fills it in (#110).
      deviceId: null,
      signingPublicKey: text.signing,
      agreementPublicKey: text.agreement,
    },
    keys,
  );
  return {
    status: "accepted",
    safetyCode: computeSafetyCode(sodium, own, invitation.publicKeys),
  };
}

export function createAcceptor(deps: AcceptorDeps): Acceptor {
  const { pairs } = deps;
  return {
    accept: async (linkOrText) => {
      if ((await pairs.current()) !== null) return { status: "already-paired" };
      const invitation = decode(linkOrText);
      if (!invitation) return { status: "invalid" };
      return accept(deps, invitation);
    },
    confirm: () => pairs.confirm(),
    reject: () => pairs.remove(),
  };
}
