import { encryptEnvelope, type PairKeys } from "@parapka/crypto";
import { PROTOCOL_VERSION, type Envelope } from "@parapka/protocol";
import { vi } from "vitest";

import type { Profile } from "../data/profile";
import { createMemoryDatabase } from "../data/memory-database";
import { createIdentity } from "../identity/identity";
import {
  createPairRepository,
  type PairRepository,
} from "../pairing/pair-repository";
import type { Platform } from "../platform/context";
import { createMemoryKeyStore } from "../platform/memory-key-store";
import { webSha256 } from "../platform/sha256";
import { createWebSodium } from "../platform/web-sodium";
import { wireConsent } from "../consent/wiring";
import { base64Encode } from "./base64";
import { wireSync, type SyncController } from "./wiring";

export const stoppers: (() => void)[] = [];

export const profile: Profile = {
  name: "Ola",
  form: "feminine",
  adultConfirmed: true,
  relationshipTenure: "1-3",
  hasChildren: false,
  childrenCount: 0,
  goals: [],
  otherGoalText: null,
  shareGoalsWithPartner: false,
  cycle: "no",
  pinDecision: "skipped",
};

export const keys: PairKeys = {
  sendKey: new Uint8Array(32).fill(1),
  receiveKey: new Uint8Array(32).fill(2),
};

function socket() {
  return {
    onopen: null,
    onmessage: null,
    onclose: null,
    onerror: null,
    close: vi.fn(),
  };
}

/** The envelope of the partner with a command `disconnect`, readable by `keys`. */
export function disconnectEnvelope(
  sodium: Awaited<ReturnType<typeof createWebSodium>>,
  mailbox = "mailbox-1",
): Envelope {
  const fields = {
    envelopeId: "e-disconnect",
    pairMailboxId: mailbox,
    senderDeviceId: "partner",
    protocolVersion: PROTOCOL_VERSION,
  };
  const content = {
    schemaVersion: 1,
    changes: [
      {
        entity: "Pair",
        id: "pair",
        op: "upsert",
        fields: {
          command: {
            value: "disconnect",
            hlc: "000000000000001-00000-partner",
          },
        },
      },
    ],
  };
  const encrypted = encryptEnvelope(
    sodium,
    keys.receiveKey,
    fields,
    new TextEncoder().encode(JSON.stringify(content)),
  );
  return {
    ...fields,
    nonce: base64Encode(encrypted.nonce),
    ciphertext: base64Encode(encrypted.ciphertext),
  };
}

/** Answers `status` to every call but challenges; `waiting` goes out on the first fetch. */
function stubRelay(status: number, waiting: Envelope[]) {
  const calls: string[] = [];
  vi.stubGlobal("fetch", (url: string, init: { method: string }) => {
    calls.push(`${init.method} ${url}`);
    const challenge = url.endsWith("/challenges");
    const handedOut = url.includes("/envelopes") ? waiting.splice(0) : [];
    return Promise.resolve({
      status: challenge ? 201 : status,
      text: () =>
        Promise.resolve(
          challenge
            ? JSON.stringify({ challengeId: "c", nonce: "n" })
            : JSON.stringify({
                envelopes: handedOut.map((envelope) => ({ envelope })),
                nextCursor: handedOut.length > 0 ? "cursor-1" : null,
              }),
        ),
    });
  });
  return calls;
}

/** Saves and confirms a pair with the mailbox `mailbox`. */
function pairing(pairs: PairRepository) {
  return (mailbox = "mailbox-1") =>
    pairs
      .savePending(
        {
          pairMailboxId: mailbox,
          deviceId: "partner",
          signingPublicKey: "s",
          agreementPublicKey: "a",
        },
        keys,
      )
      .then(() => pairs.confirm());
}

/**
 * A registered device on a platform whose relay answers `status` to every call
 * but challenges; with `command` the first fetch brings the disconnect command.
 */
export async function setup(status = 200, command = false) {
  const sodium = await createWebSodium();
  const database = createMemoryDatabase();
  const keyStore = createMemoryKeyStore();
  await createIdentity({
    sodium,
    keyStore,
    database,
    relay: () => ({
      registerDevice: () => Promise.resolve({ deviceId: "me" }),
    }),
  }).init();
  const calls = stubRelay(status, command ? [disconnectEnvelope(sodium)] : []);
  const createSocket = vi.fn(socket);
  const platform = {
    sodium,
    keyStore,
    clock: { nowMs: () => 1_000 },
    database,
    sha256: webSha256,
    relayUrl: "unused-relay",
    appUrl: "unused",
    createSocket,
  } as unknown as Platform;
  const pairs = createPairRepository(database, keyStore);
  const { consent, profiles } = wireConsent(platform);
  const controller = wireSync(platform);
  stoppers.push(() => {
    controller.unmount();
  });
  const pair = pairing(pairs);
  const syncs = () => calls.filter((c) => c.includes("/envelopes")).length;
  return {
    sodium,
    platform,
    controller,
    createSocket,
    pairs,
    consent,
    profiles,
    pair,
    syncs,
  };
}

export function start(controller: SyncController) {
  controller.setActive(true);
  controller.mount();
}

export const tick = () => new Promise((resolve) => setTimeout(resolve, 20));
