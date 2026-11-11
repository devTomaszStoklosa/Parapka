import {
  derivePairKeys,
  encryptEnvelope,
  type PairKeys,
  type Sodium,
} from "@parapka/crypto";
import type { Clock } from "@parapka/domain";
import {
  PROTOCOL_VERSION,
  type ContentChange,
  type Envelope,
} from "@parapka/protocol";
import {
  applyChange,
  emptyEntityState,
  entityValues,
  type Change,
  type EntityState,
} from "@parapka/sync";

import type { ConsentCategory } from "../consent/consent-model";
import type { LocalDatabase } from "../data/local-database";
import { createMemoryDatabase } from "../data/memory-database";
import {
  createPairRepository,
  type PairRepository,
} from "../pairing/pair-repository";
import { createMemoryKeyStore } from "../platform/memory-key-store";
import { createWebSodium } from "../platform/web-sodium";
import { base64Encode } from "./base64";
import {
  createHandlerRegistry,
  type NextHlc,
  type SyncHandler,
} from "./handler-registry";
import {
  createSyncEngine,
  type SyncEngine,
  type SyncEngineOptions,
} from "./sync-engine";
import {
  createMemoryRelay,
  type MemoryRelay,
  type SyncTransport,
} from "./transport";

export const MAILBOX = "mailbox-1";

type Draft = (nextHlc: NextHlc) => ContentChange;

/** Test entity "Chore" kept in memory, merged with `applyChange`. */
export class ChoreHandler implements SyncHandler {
  readonly entity = "Chore";
  applied = 0;
  /** Times the engine reported the collected changes as saved in the queue. */
  committedCount = 0;
  forgotten = 0;
  disconnectedCount = 0;
  private readonly states = new Map<string, EntityState>();
  private drafts: Draft[] = [];

  constructor(readonly category: ConsentCategory | null = null) {}

  /** Queues a local edit; it is stamped and merged when the engine collects. */
  edit(id: string, name: string, value: unknown): void {
    this.drafts.push((nextHlc) => ({
      entity: this.entity,
      id,
      op: "upsert",
      fields: { [name]: { value, hlc: nextHlc() } },
    }));
  }

  remove(id: string): void {
    this.drafts.push((nextHlc) => ({
      entity: this.entity,
      id,
      op: "delete",
      hlc: nextHlc(),
    }));
  }

  collect(nextHlc: NextHlc): Promise<readonly ContentChange[]> {
    const changes = this.drafts.map((draft) => draft(nextHlc));
    this.drafts = [];
    for (const change of changes) this.merge(change);
    return Promise.resolve(changes);
  }

  committed(): Promise<void> {
    this.committedCount += 1;
    return Promise.resolve();
  }

  forgetReceived(): Promise<void> {
    this.forgotten += 1;
    return Promise.resolve();
  }

  disconnected(): Promise<void> {
    this.disconnectedCount += 1;
    return Promise.resolve();
  }

  apply(change: ContentChange): Promise<void> {
    this.applied += 1;
    this.merge(change);
    return Promise.resolve();
  }

  /** Plain values of every entity that is not deleted. */
  snapshot(): Record<string, Record<string, unknown>> {
    const result: Record<string, Record<string, unknown>> = {};
    for (const [id, state] of this.states) {
      const values = entityValues(state);
      if (values !== null) result[id] = values;
    }
    return result;
  }

  private merge(change: ContentChange): void {
    const state =
      this.states.get(change.id) ?? emptyEntityState("Chore", change.id);
    this.states.set(change.id, applyChange(state, change as Change));
  }
}

export interface Device {
  readonly id: string;
  readonly database: LocalDatabase;
  readonly pairs: PairRepository;
  readonly handler: ChoreHandler;
  readonly transport: SyncTransport;
  readonly keys: PairKeys;
  engine: SyncEngine;
  /** A new engine on the same database, like after a restart of the app. */
  restart(overrides?: Partial<SyncEngineOptions>): SyncEngine;
}

export interface PairedDevices {
  readonly a: Device;
  readonly b: Device;
  readonly relay: MemoryRelay;
  readonly sodium: Sodium;
}

/** Strictly increasing time, so every reading is new. */
export function createTickingClock(): Clock {
  let now = 1_800_000_000_000;
  return { nowMs: () => (now += 1) };
}

async function createDevice(
  sodium: Sodium,
  relay: MemoryRelay,
  id: string,
  partner: { deviceId: string | null; keys: PairKeys },
): Promise<Device> {
  const database = createMemoryDatabase();
  const pairs = createPairRepository(database, createMemoryKeyStore());
  await pairs.savePending(
    {
      pairMailboxId: MAILBOX,
      deviceId: partner.deviceId,
      signingPublicKey: "signing",
      agreementPublicKey: "agreement",
    },
    partner.keys,
  );
  await pairs.confirm();
  const handler = new ChoreHandler();
  const transport = relay.connect(id);
  const clock = createTickingClock();
  const restart = (overrides: Partial<SyncEngineOptions> = {}) => {
    const registry = createHandlerRegistry();
    registry.register(handler);
    return createSyncEngine({
      database,
      pairs,
      identity: { deviceId: () => Promise.resolve(id) },
      sodium,
      clock,
      transport,
      registry,
      ...overrides,
    });
  };
  const device: Device = {
    id,
    database,
    pairs,
    handler,
    transport,
    keys: partner.keys,
    engine: restart(),
    restart: (overrides) => {
      device.engine = restart(overrides);
      return device.engine;
    },
  };
  return device;
}

/** Two confirmed devices of one pair; B does not know the device id of A yet. */
export async function createPairedDevices(): Promise<PairedDevices> {
  const sodium = await createWebSodium();
  const relay = createMemoryRelay();
  const aKeys = sodium.kxKeyPair();
  const bKeys = sodium.kxKeyPair();
  const a = await createDevice(sodium, relay, "device-a", {
    deviceId: "device-b",
    keys: derivePairKeys(sodium, "inviter", aKeys, bKeys.publicKey),
  });
  const b = await createDevice(sodium, relay, "device-b", {
    deviceId: null,
    keys: derivePairKeys(sodium, "acceptor", bKeys, aKeys.publicKey),
  });
  return { a, b, relay, sodium };
}

/** Sends text as the content of a correctly built envelope of device A. */
export async function sendRaw(
  { a, sodium }: Pick<PairedDevices, "a" | "sodium">,
  envelopeId: string,
  text: string,
  key: Uint8Array = a.keys.sendKey,
): Promise<void> {
  const fields = {
    envelopeId,
    pairMailboxId: MAILBOX,
    senderDeviceId: a.id,
    protocolVersion: PROTOCOL_VERSION,
  };
  const encrypted = encryptEnvelope(
    sodium,
    key,
    fields,
    new TextEncoder().encode(text),
  );
  const envelope: Envelope = {
    ...fields,
    nonce: base64Encode(encrypted.nonce),
    ciphertext: base64Encode(encrypted.ciphertext),
  };
  await a.transport.send(envelope);
}
