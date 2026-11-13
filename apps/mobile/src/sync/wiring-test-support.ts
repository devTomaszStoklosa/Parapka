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

/** The envelope of the partner with `changes`, readable by `keys`. */
export function partnerEnvelope(
  sodium: Awaited<ReturnType<typeof createWebSodium>>,
  mailbox: string,
  changes: unknown[],
): Envelope {
  const fields = {
    envelopeId: "e-disconnect",
    pairMailboxId: mailbox,
    senderDeviceId: "partner",
    protocolVersion: PROTOCOL_VERSION,
  };
  const content = { schemaVersion: 1, changes };
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

/** The envelope of the partner with a command `disconnect`, readable by `keys`. */
export function disconnectEnvelope(
  sodium: Awaited<ReturnType<typeof createWebSodium>>,
  mailbox = "mailbox-1",
  after: unknown[] = [],
): Envelope {
  return partnerEnvelope(sodium, mailbox, [
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
    ...after,
  ]);
}

/** Answers `status` to every call but challenges; `waiting` goes out on the first fetch. */
function stubRelay(status: number, waiting: Envelope[]) {
  const calls: string[] = [];
  const waiters: {
    match: (call: string) => boolean;
    resolve: (call: string) => void;
  }[] = [];
  vi.stubGlobal("fetch", (url: string, init: { method: string }) => {
    const call = `${init.method} ${url}`;
    calls.push(call);
    for (const waiter of waiters.splice(0)) {
      if (waiter.match(call)) waiter.resolve(call);
      else waiters.push(waiter);
    }
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
  /** Resolves on the next relay call (`"METHOD url"`) that `match` accepts. */
  const nextCall = (match: (call: string) => boolean) =>
    new Promise<string>((resolve) => {
      waiters.push({ match, resolve });
    });
  return { calls, nextCall };
}

/** The envelope the first fetch hands out, if any. */
function waitingFor(
  sodium: Awaited<ReturnType<typeof createWebSodium>>,
  command: boolean,
  after: unknown[],
  partner: unknown[],
) {
  if (command) return [disconnectEnvelope(sodium, "mailbox-1", after)];
  return partner.length > 0
    ? [partnerEnvelope(sodium, "mailbox-1", partner)]
    : [];
}

/** How many calls sent an envelope. */
const countPosts = (calls: string[]) =>
  calls.filter((c) => c.startsWith("POST") && c.includes("/envelopes")).length;

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
 * but challenges; with `command` the first fetch brings the disconnect command,
 * with `partner` changes the envelope of the partner.
 */
export async function setup(
  status = 200,
  command = false,
  after: unknown[] = [],
  partner: unknown[] = [],
) {
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
  const relay = stubRelay(status, waitingFor(sodium, command, after, partner));
  const createSocket = vi.fn(socket);
  const clock = { nowMs: () => 1_000 };
  const platform = {
    sodium,
    keyStore,
    clock,
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
  return {
    sodium,
    platform,
    controller,
    createSocket,
    pairs,
    consent,
    profiles,
    pair: pairing(pairs),
    nextCall: relay.nextCall,
    syncs: () => relay.calls.filter((c) => c.includes("/envelopes")).length,
    posts: () => countPosts(relay.calls),
  };
}

export function start(controller: SyncController) {
  controller.setActive(true);
  controller.mount();
}

export const tick = () => new Promise((resolve) => setTimeout(resolve, 20));

/** The limit of waiting for a state that has no event to wait for. */
export const CYCLE = { timeout: 10_000 };

/** The limit of a test that waits for whole cycles of the engine. */
export const SLOW = 20_000;

/** Whether the call fetched envelopes: a run of the engine. */
export const isRun = (call: string) => call.includes("/envelopes");

/** Runs the action and waits until it triggered another synchronization. */
export async function runsAfter(
  set: { nextCall: (match: (call: string) => boolean) => Promise<string> },
  action: () => Promise<unknown>,
) {
  await tick();
  const next = set.nextCall(isRun);
  await action();
  await next;
}
