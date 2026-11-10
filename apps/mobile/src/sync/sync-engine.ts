import {
  decryptEnvelope,
  encryptEnvelope,
  type PairKeys,
  type Sodium,
} from "@parapka/crypto";
import { createUuid7Generator, type Clock } from "@parapka/domain";
import {
  PROTOCOL_VERSION,
  SUPPORTED_SCHEMA_VERSION,
  validateContent,
  validateEnvelope,
  type ContentChange,
  type Envelope,
  type EnvelopeContent,
} from "@parapka/protocol";
import { formatHlc, HybridLogicalClock, parseHlc } from "@parapka/sync";

import type { ConsentCategory } from "../consent/consent-model";
import type { JsonValue, LocalDatabase } from "../data/local-database";
import type { Identity } from "../identity/identity";
import type { Pair, PairRepository } from "../pairing/pair-repository";
import { base64Decode, base64Encode } from "./base64";
import type { HandlerRegistry } from "./handler-registry";
import type { SyncTransport } from "./transport";

const OUTBOX = "sync-outbox";
const APPLIED = "sync-applied";
const ERRORS = "sync-errors";
const HELD = "sync-held";
const STATE = "sync-state";
const CURSOR = "cursor";
const CLOCK = "hlc";
// The pair repository owns this record; the engine only fills in `deviceId`.
const PAIR = { collection: "pair", id: "current" };

const encoder = new TextEncoder();
const decoder = new TextDecoder();

export type SyncErrorReason =
  "invalid-envelope" | "decrypt-failed" | "invalid-content";

/** A rejected envelope; it never holds the content (NFR-SYNC-05). */
export interface SyncErrorEntry {
  readonly id: string;
  readonly atMs: number;
  readonly reason: SyncErrorReason;
  readonly envelopeId: string | null;
}

/** Content kept untouched because this version cannot apply it yet. */
export interface HeldEntry {
  readonly envelopeId: string;
  readonly kind: "needs-update" | "unknown-entity";
  readonly content: JsonValue;
}

export interface SyncEngineOptions {
  database: LocalDatabase;
  pairs: PairRepository;
  identity: Pick<Identity, "deviceId">;
  sodium: Sodium;
  clock: Clock;
  transport: SyncTransport;
  registry: HandlerRegistry;
  /** Extension point for the consent (#139); synchronization runs when true. */
  canSync?: () => boolean;
  /** Extension point for the consent (#139); data of a category moves when true. */
  isShared?: (category: ConsentCategory) => boolean;
}

export interface SyncEngine {
  /** Queues the local changes and sends the queue; keeps what it cannot send. */
  push(): Promise<void>;
  /** Fetches, applies and acknowledges the envelopes of the partner. */
  pull(): Promise<void>;
  sync(): Promise<void>;
  /** Envelopes waiting to be sent. */
  pending(): Promise<number>;
  errors(): Promise<SyncErrorEntry[]>;
  held(): Promise<HeldEntry[]>;
}

interface Session {
  pair: Pair;
  readonly keys: PairKeys;
  readonly deviceId: string;
}

function hlcTexts(change: ContentChange): string[] {
  return change.op === "upsert"
    ? Object.values(change.fields).map((field) => field.hlc)
    : [change.hlc];
}

const asJson = (value: unknown) => value as JsonValue;

class Engine implements SyncEngine {
  private hlc: HybridLogicalClock | null = null;
  private readonly newId: () => string;

  constructor(private readonly o: SyncEngineOptions) {
    this.newId = createUuid7Generator({
      clock: o.clock,
      random: { bytes: (length) => o.sodium.randomBytes(length) },
    });
  }

  async push(): Promise<void> {
    const session = await this.session();
    if (session === null) return;
    await this.enqueue(session);
    for (const record of await this.o.database.list(OUTBOX)) {
      await this.o.transport.send(record.value as unknown as Envelope);
      await this.o.database.delete(OUTBOX, record.id);
    }
  }

  async pull(): Promise<void> {
    const session = await this.session();
    if (session === null) return;
    const { database, transport } = this.o;
    const state = (await database.get(STATE, CURSOR)) as {
      after: string | null;
    } | null;
    const fetched = await transport.fetch(state?.after ?? null);
    for (const { envelope } of fetched.envelopes) {
      await this.receive(session, envelope);
    }
    if (fetched.nextCursor !== null) {
      await database.put(STATE, CURSOR, { after: fetched.nextCursor });
    }
    if (fetched.envelopes.length > 0) {
      await transport.ack(fetched.envelopes.map((e) => e.envelope.envelopeId));
    }
  }

  async sync(): Promise<void> {
    await this.push();
    await this.pull();
  }

  async pending(): Promise<number> {
    return (await this.o.database.list(OUTBOX)).length;
  }

  async errors(): Promise<SyncErrorEntry[]> {
    const records = await this.o.database.list(ERRORS);
    return records.map((r) => r.value as unknown as SyncErrorEntry);
  }

  async held(): Promise<HeldEntry[]> {
    const records = await this.o.database.list(HELD);
    return records.map((r) => r.value as unknown as HeldEntry);
  }

  /** Nothing moves without a confirmed pair, its keys, a device id and the consent. */
  private async session(): Promise<Session | null> {
    if (!(this.o.canSync?.() ?? true)) return null;
    const pair = await this.o.pairs.activePair();
    const keys = await this.o.pairs.keys();
    const deviceId = await this.o.identity.deviceId();
    if (pair === null || keys === null || deviceId === null) return null;
    return { pair, keys, deviceId };
  }

  /** The clock is fed with the last saved stamp, so a restart keeps causality. */
  private async clockFor(deviceId: string): Promise<HybridLogicalClock> {
    if (this.hlc !== null) return this.hlc;
    const hlc = new HybridLogicalClock(this.o.clock, deviceId);
    const saved = (await this.o.database.get(STATE, CLOCK)) as {
      last: string;
    } | null;
    if (saved !== null) hlc.receive(parseHlc(saved.last));
    this.hlc = hlc;
    return hlc;
  }

  private async saveClock(hlc: HybridLogicalClock): Promise<void> {
    await this.o.database.put(STATE, CLOCK, { last: formatHlc(hlc.now()) });
  }

  private shared(category: ConsentCategory | null): boolean {
    return category === null || (this.o.isShared?.(category) ?? true);
  }

  /** Collects the local changes into one encrypted envelope in the outbox. */
  private async enqueue(session: Session): Promise<void> {
    const hlc = await this.clockFor(session.deviceId);
    const changes: ContentChange[] = [];
    for (const handler of this.o.registry.all()) {
      if (!this.shared(handler.category)) continue;
      changes.push(...(await handler.collect(() => formatHlc(hlc.now()))));
    }
    if (changes.length === 0) return;
    await this.saveClock(hlc);
    const content: EnvelopeContent = {
      schemaVersion: SUPPORTED_SCHEMA_VERSION,
      changes,
    };
    const fields = {
      envelopeId: this.newId(),
      pairMailboxId: session.pair.pairMailboxId,
      senderDeviceId: session.deviceId,
      protocolVersion: PROTOCOL_VERSION,
    };
    const encrypted = encryptEnvelope(
      this.o.sodium,
      session.keys.sendKey,
      fields,
      encoder.encode(JSON.stringify(content)),
    );
    const envelope: Envelope = {
      ...fields,
      nonce: base64Encode(encrypted.nonce),
      ciphertext: base64Encode(encrypted.ciphertext),
    };
    await this.o.database.put(OUTBOX, fields.envelopeId, asJson(envelope));
  }

  private async receive(session: Session, raw: Envelope): Promise<void> {
    const checked = validateEnvelope(raw);
    if (!checked.ok) return this.reject("invalid-envelope", null);
    const envelope = checked.value;
    const { envelopeId } = envelope;
    if ((await this.o.database.get(APPLIED, envelopeId)) !== null) return;
    let plain: Uint8Array;
    try {
      plain = decryptEnvelope(
        this.o.sodium,
        session.keys.receiveKey,
        envelope,
        {
          nonce: base64Decode(envelope.nonce),
          ciphertext: base64Decode(envelope.ciphertext),
        },
      );
    } catch {
      return this.reject("decrypt-failed", envelopeId);
    }
    await this.learnPartnerDevice(session, envelope.senderDeviceId);
    let json: unknown;
    try {
      json = JSON.parse(decoder.decode(plain));
    } catch {
      return this.reject("invalid-content", envelopeId);
    }
    await this.handleContent(session, envelopeId, json);
  }

  private async handleContent(
    session: Session,
    envelopeId: string,
    json: unknown,
  ): Promise<void> {
    const content = validateContent(json);
    if (!content.ok) return this.reject("invalid-content", envelopeId);
    if (content.status === "needs-update") {
      await this.hold(envelopeId, envelopeId, "needs-update", json);
    } else if (!(await this.applyAll(session, envelopeId, content.value))) {
      return;
    }
    await this.o.database.put(APPLIED, envelopeId, {
      atMs: this.o.clock.nowMs(),
    });
  }

  /** False when a timestamp is malformed; then nothing is applied. */
  private async applyAll(
    session: Session,
    envelopeId: string,
    content: EnvelopeContent,
  ): Promise<boolean> {
    let stamps;
    try {
      stamps = content.changes.flatMap(hlcTexts).map(parseHlc);
    } catch {
      await this.reject("invalid-content", envelopeId);
      return false;
    }
    const hlc = await this.clockFor(session.deviceId);
    for (const stamp of stamps) hlc.receive(stamp);
    await this.saveClock(hlc);
    for (const [index, change] of content.changes.entries()) {
      const handler = this.o.registry.get(change.entity);
      if (handler === undefined) {
        await this.hold(
          `${envelopeId}/${String(index)}`,
          envelopeId,
          "unknown-entity",
          change,
        );
      } else if (this.shared(handler.category)) {
        await handler.apply(change);
      }
    }
    return true;
  }

  private async hold(
    id: string,
    envelopeId: string,
    kind: HeldEntry["kind"],
    content: unknown,
  ): Promise<void> {
    const entry: HeldEntry = { envelopeId, kind, content: asJson(content) };
    await this.o.database.put(HELD, id, asJson(entry));
  }

  private async reject(
    reason: SyncErrorReason,
    envelopeId: string | null,
  ): Promise<void> {
    const id = this.newId();
    const entry: SyncErrorEntry = {
      id,
      atMs: this.o.clock.nowMs(),
      reason,
      envelopeId,
    };
    await this.o.database.put(ERRORS, id, asJson(entry));
  }

  /** Side B learns the device id of A from the first envelope it can read. */
  private async learnPartnerDevice(
    session: Session,
    senderDeviceId: string,
  ): Promise<void> {
    if (session.pair.deviceId !== null) return;
    session.pair = { ...session.pair, deviceId: senderDeviceId };
    await this.o.database.put(PAIR.collection, PAIR.id, asJson(session.pair));
  }
}

export function createSyncEngine(options: SyncEngineOptions): SyncEngine {
  return new Engine(options);
}
