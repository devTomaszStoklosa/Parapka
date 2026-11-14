import { decryptEnvelope } from "@parapka/crypto";
import type { GeneratedHint } from "@parapka/domain";
import type { ContentChange, Envelope } from "@parapka/protocol";
import { afterEach, expect, it, vi } from "vitest";

import { defaultConsent } from "../consent/consent-model";
import { createDisconnectRepository } from "../pairing/disconnect-repository";
import { base64Decode } from "../sync/base64";
import { createHandlerRegistry } from "../sync/handler-registry";
import { createPairedDevices, type Device } from "../sync/sync-test-support";
import {
  CYCLE,
  profile,
  setup,
  start,
  stoppers,
} from "../sync/wiring-test-support";
import { createHintHandler } from "./hint-sync";
import { addDays, createHintRepository } from "./hint-repository";
import {
  createReceivedHintRepository,
  RECEIVED,
} from "./received-hint-repository";
import { wireCycle, wireCycleHints } from "./wiring";

afterEach(() => {
  for (const stop of stoppers.splice(0)) stop();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const DAY = "2026-11-14";

const hint = (
  date: string,
  text: string,
  templateId = "t1",
): GeneratedHint => ({
  templateId,
  contentVersion: 3,
  category: "relief",
  date,
  text,
});

type Phone = ReturnType<typeof phone>;

// A device with its own hints, its received hints and a hint handler.
function phone(device: Device, today: { value: string }) {
  const flags = { shared: true, paused: false };
  const sent: Envelope[] = [];
  let counter = 0;
  const hints = createHintRepository({
    database: device.database,
    newId: () => `${device.id}-h${String(++counter)}`,
  });
  const received = createReceivedHintRepository({
    database: device.database,
    today: () => today.value,
  });
  const registry = createHandlerRegistry();
  registry.register(createHintHandler({ hints, received }));
  device.restart({
    registry,
    isShared: (category) => category !== "CYCLE_HINTS" || flags.shared,
    isPaused: () => flags.paused,
    transport: {
      ...device.transport,
      send: (envelope) => {
        sent.push(envelope);
        return device.transport.send(envelope);
      },
    },
  });
  return { device, today, flags, sent, hints, received };
}

async function pair() {
  const devices = await createPairedDevices();
  const a = phone(devices.a, { value: DAY });
  const b = phone(devices.b, { value: DAY });
  const changesOf = ({ sent }: Phone): ContentChange[] =>
    sent.flatMap((envelope) => {
      const { nonce, ciphertext, ...fields } = envelope;
      const key =
        envelope.senderDeviceId === "device-a"
          ? devices.a.keys
          : devices.b.keys;
      const plain = decryptEnvelope(devices.sodium, key.sendKey, fields, {
        nonce: base64Decode(nonce),
        ciphertext: base64Decode(ciphertext),
      });
      const content = JSON.parse(new TextDecoder().decode(plain)) as {
        changes: ContentChange[];
      };
      return content.changes;
    });
  return { a, b, changesOf };
}

const run = async (from: Phone, to: Phone) => {
  await from.device.engine.push();
  await to.device.engine.pull();
};

it("sends the four fields once and gives the partner the same hint", async () => {
  const { a, b, changesOf } = await pair();
  await a.hints.put(hint(DAY, "Pierwsza"));
  await run(a, b);
  await a.device.engine.push();

  const [change, ...rest] = changesOf(a);
  expect(rest).toEqual([]);
  expect(change).toMatchObject({
    entity: "Hint",
    id: "device-a-h1",
    op: "upsert",
  });
  const fields = change?.op === "upsert" ? change.fields : {};
  expect(Object.keys(fields).sort()).toEqual([
    "category",
    "forDate",
    "status",
    "text",
  ]);
  expect(Object.values(fields).every(({ hlc }) => hlc.length > 0)).toBe(true);
  expect(await b.received.today()).toEqual({
    id: "device-a-h1",
    forDate: DAY,
    text: "Pierwsza",
    category: "relief",
    status: "scheduled",
  });
  const stored = await b.device.database.get(RECEIVED, "device-a-h1");
  expect(stored).toMatchObject({ state: { entity: "Hint" } });
});

it("replaces the text with a newer version, never with an older, and shrugs off repeats", async () => {
  const { a, b, changesOf } = await pair();
  await a.hints.put(hint(DAY, "Stara"));
  await run(a, b);
  await a.hints.put(hint(DAY, "Nowa", "t2"));
  await run(a, b);
  const [old] = changesOf(a);
  if (old === undefined) throw new Error("nothing was sent");
  await b.received.merge(old);
  await b.received.merge(old);
  expect(await b.received.today()).toMatchObject({
    id: "device-a-h1",
    text: "Nowa",
  });
  expect(await b.device.database.list(RECEIVED)).toHaveLength(1);
});

it("is one-way: the partner needs no cycle and each sender decides alone", async () => {
  const { a, b, changesOf } = await pair();
  b.flags.shared = false;
  await a.hints.put(hint(DAY, "Od A"));
  await run(a, b);
  expect(await b.received.today()).toMatchObject({ text: "Od A" });

  b.flags.shared = true;
  a.flags.shared = false;
  await a.hints.put(hint(addDays(DAY, 1), "Jutro"));
  await b.hints.put(hint(DAY, "Od B"));
  await run(b, a);
  await a.device.engine.push();
  expect(a.sent).toHaveLength(1);
  expect(await a.received.today()).toMatchObject({
    id: "device-b-h1",
    text: "Od B",
  });
  expect(await a.hints.forDate(DAY)).toMatchObject({ text: "Od A" });

  const foreign = changesOf(a)[0];
  if (foreign?.op !== "upsert") throw new Error("nothing was sent");
  const text = { value: "Cudzy", hlc: "9".repeat(15) + "-00000-device-b" };
  await a.received.merge({ ...foreign, fields: { ...foreign.fields, text } });
  expect(await a.hints.forDate(DAY)).toMatchObject({ text: "Od A" });
  expect((await a.device.database.list(RECEIVED)).map(({ id }) => id)).toEqual([
    "device-b-h1",
  ]);
});

it("sends nothing without the consent or in the pause, then catches up", async () => {
  const { a, b } = await pair();
  a.flags.shared = false;
  for (let offset = -15; offset <= 2; offset += 1) {
    await a.hints.put(hint(addDays(DAY, offset), `Dzień ${String(offset)}`));
  }
  await run(a, b);
  expect(a.sent).toEqual([]);
  expect(await b.device.database.list(RECEIVED)).toEqual([]);

  a.flags.shared = true;
  await run(a, b);
  expect(await b.received.today()).toMatchObject({ text: "Dzień 0" });
  expect(await b.received.history()).toHaveLength(14);
  expect(await b.device.database.list(RECEIVED)).toHaveLength(17);

  a.flags.paused = true;
  await a.hints.put(hint(addDays(DAY, 3), "Za trzy dni"));
  await run(a, b);
  expect(a.sent).toHaveLength(1);
  a.flags.paused = false;
  await run(a, b);
  expect(a.sent).toHaveLength(2);
  expect(await b.device.database.list(RECEIVED)).toHaveLength(18);
});

it("keeps the hint of the day of the partner after two days offline", async () => {
  const { a, b } = await pair();
  for (let offset = 0; offset < 3; offset += 1) {
    await a.hints.put(hint(addDays(DAY, offset), `Dzień ${String(offset)}`));
  }
  await run(a, b);
  b.today.value = addDays(DAY, 2);
  expect(await b.received.today()).toMatchObject({ text: "Dzień 2" });
  expect(await b.received.history()).toHaveLength(2);
});

it("forgets the received hints when the pair is ended", async () => {
  const set = await setup(200, true);
  await set.pair();
  await set.consent.save(defaultConsent(profile));
  const { received } = wireCycleHints(set.platform);
  const field = (value: string) => ({
    value,
    hlc: "000000000000001-00000-partner",
  });
  await received.merge({
    entity: "Hint",
    id: "h1",
    op: "upsert",
    fields: {
      forDate: field(wireCycle(set.platform).today()),
      text: field("Od partnera"),
      category: field("space"),
      status: field("scheduled"),
    },
  });
  expect(await received.today()).not.toBeNull();
  start(set.controller);
  await vi.waitFor(async () => {
    const closing = createDisconnectRepository(set.platform.database);
    expect(await closing.state()).toBe("by-partner");
  }, CYCLE);
  expect(await set.platform.database.list(RECEIVED)).toEqual([]);
}, 20_000);
