import { decryptEnvelope } from "@parapka/crypto";
import type { GeneratedHint } from "@parapka/domain";
import type { ContentChange, Envelope } from "@parapka/protocol";
import { expect, it } from "vitest";

import { clearPairLocally } from "../pairing/clear-pair";
import { base64Decode } from "../sync/base64";
import { createHandlerRegistry } from "../sync/handler-registry";
import { createPairedDevices, type Device } from "../sync/sync-test-support";
import { createHintHandler } from "./hint-sync";
import { addDays, createHintRepository, HINTS } from "./hint-repository";
import { createReceivedHintRepository } from "./received-hint-repository";
import { createHintWithdrawalHandler } from "./hint-withdrawal";

const DAY = "2026-11-14";

const hint = (date: string, text: string): GeneratedHint => ({
  templateId: "t1",
  contentVersion: 3,
  category: "relief",
  date,
  text,
});

type Phone = ReturnType<typeof phone>;

/** A device with the hints, the command that takes them back and a wrapped `send`. */
function phone(device: Device) {
  const flags = { shared: true, paused: false, day: DAY };
  const sent: Envelope[] = [];
  let counter = 0;
  const hints = createHintRepository({
    database: device.database,
    newId: () => `${device.id}-h${String(++counter)}`,
  });
  const received = createReceivedHintRepository({
    database: device.database,
    today: () => flags.day,
  });
  const registry = createHandlerRegistry();
  registry.register(
    createHintWithdrawalHandler({
      database: device.database,
      today: () => flags.day,
      consent: { isShared: () => Promise.resolve(flags.shared) },
      pause: { isPaused: () => Promise.resolve(flags.paused) },
      hints,
      received,
    }),
  );
  const hintHandler = createHintHandler({
    hints,
    received,
    today: () => flags.day,
  });
  registry.register(hintHandler);
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
  return { device, flags, sent, hints, received, hintHandler, registry };
}

async function pair() {
  const devices = await createPairedDevices();
  const a = phone(devices.a);
  const b = phone(devices.b);
  const changesOf = ({ sent }: Phone): ContentChange[] =>
    sent.flatMap((envelope) => {
      const { nonce, ciphertext, ...fields } = envelope;
      const plain = decryptEnvelope(
        devices.sodium,
        devices.a.keys.sendKey,
        fields,
        { nonce: base64Decode(nonce), ciphertext: base64Decode(ciphertext) },
      );
      return (
        JSON.parse(new TextDecoder().decode(plain)) as {
          changes: ContentChange[];
        }
      ).changes;
    });
  const commandsOf = (phone: Phone) =>
    changesOf(phone).filter(({ entity }) => entity === "HintWithdrawal");
  // A has hints for yesterday, today and the two days ahead.
  const fill = async () => {
    for (let offset = -1; offset <= 2; offset += 1) {
      await a.hints.put(hint(addDays(DAY, offset), `Dzień ${String(offset)}`));
    }
  };
  return { devices, a, b, changesOf, commandsOf, fill };
}

const run = async (from: Phone, to: Phone) => {
  await from.device.engine.push();
  await to.device.engine.pull();
};

const days = async ({ received }: Phone) =>
  (await received.history()).length + Number((await received.today()) !== null);

const texts = async ({ device }: Phone) =>
  (await device.database.list("cycle-hints-received"))
    .map(({ value }) => JSON.stringify(value).match(/Dzień -?\d/)?.[0] ?? "")
    .sort();

it("takes back the hints from today on in a pause, then sends them anew", async () => {
  const { a, b, fill, commandsOf } = await pair();
  await fill();
  await run(a, b);
  expect(await texts(b)).toEqual(["Dzień -1", "Dzień 0", "Dzień 1", "Dzień 2"]);

  a.flags.paused = true;
  await run(a, b);
  expect(commandsOf(a)).toHaveLength(1);
  expect(a.sent).toHaveLength(2);
  expect(await texts(b)).toEqual(["Dzień -1"]);
  expect(await b.received.today()).toBeNull();
  await run(a, b);
  expect(a.sent).toHaveLength(2);

  a.flags.paused = false;
  await run(a, b);
  expect(await texts(b)).toEqual(["Dzień -1", "Dzień 0", "Dzień 1", "Dzień 2"]);
  expect(await b.received.today()).toMatchObject({ text: "Dzień 0" });
});

it("leaves the partner the state of a day without a hint, with nothing but the command", async () => {
  const { a, b, changesOf } = await pair();
  await a.hints.put(hint(DAY, "Dzień 0"));
  await run(a, b);
  a.flags.paused = true;
  await run(a, b);

  expect(await b.received.today()).toBeNull();
  expect(await b.device.database.list("cycle-hints-received")).toEqual([]);
  expect(changesOf(a).map(({ entity }) => entity)).toEqual([
    "Hint",
    "HintWithdrawal",
  ]);
});

it("does not send the hint of the pause day when the day changes in the pause", async () => {
  const { a, b } = await pair();
  a.flags.paused = true;
  await a.hints.put(hint(DAY, "Dzień 0"));
  a.flags.day = addDays(DAY, 1);
  for (let offset = 1; offset <= 3; offset += 1) {
    await a.hints.put(hint(addDays(DAY, offset), `Dzień ${String(offset)}`));
  }
  await run(a, b);
  a.flags.paused = false;
  await run(a, b);
  expect(await texts(b)).toEqual(["Dzień 1", "Dzień 2", "Dzień 3"]);
  expect(await a.hints.forDate(DAY)).toMatchObject({ text: "Dzień 0" });
});

it("does not send the hint of the withdrawal day when the day changes without the consent", async () => {
  const { a, b } = await pair();
  a.flags.shared = false;
  await a.hints.put(hint(DAY, "Dzień 0"));
  a.flags.day = addDays(DAY, 1);
  for (let offset = 1; offset <= 3; offset += 1) {
    await a.hints.put(hint(addDays(DAY, offset), `Dzień ${String(offset)}`));
  }
  await run(a, b);
  a.flags.shared = true;
  await run(a, b);
  expect(await texts(b)).toEqual(["Dzień 1", "Dzień 2", "Dzień 3"]);
});

it("removes all the hints when CYCLE_HINTS goes off, and sends today and later when it returns", async () => {
  const { a, b, fill, commandsOf } = await pair();
  await fill();
  await run(a, b);
  a.flags.shared = false;
  await run(a, b);
  expect(commandsOf(a)).toHaveLength(1);
  expect(await texts(b)).toEqual([]);

  a.flags.shared = true;
  await run(a, b);
  expect(await texts(b)).toEqual(["Dzień 0", "Dzień 1", "Dzień 2"]);
  expect(await days(b)).toBe(1);
});

it("sends one command for everything when the consent goes off in a pause", async () => {
  const { a, b, fill, commandsOf } = await pair();
  await fill();
  await run(a, b);
  a.flags.paused = true;
  await run(a, b);
  a.flags.shared = false;
  await run(a, b);
  expect(commandsOf(a)).toHaveLength(2);
  expect(await texts(b)).toEqual([]);
  await run(a, b);
  expect(commandsOf(a)).toHaveLength(2);
});

it("keeps the hints sent after the command when the envelopes arrive together", async () => {
  const { a, b, fill } = await pair();
  await fill();
  await a.device.engine.push();
  a.flags.paused = true;
  await a.device.engine.push();
  a.flags.paused = false;
  await a.device.engine.push();
  await b.device.engine.pull();
  expect(await texts(b)).toEqual(["Dzień -1", "Dzień 0", "Dzień 1", "Dzień 2"]);
});

it("leaves the own hints of the receiver untouched", async () => {
  const { a, b, fill } = await pair();
  await fill();
  await b.hints.put(hint(DAY, "Własna"));
  await run(a, b);
  a.flags.shared = false;
  await run(a, b);
  expect(await b.hints.forDate(DAY)).toMatchObject({ text: "Własna" });
  expect(await b.device.database.list(HINTS)).toHaveLength(1);
});

it("puts on the wire only the id, the scope and the timestamp of the command", async () => {
  const { a, b, fill, commandsOf } = await pair();
  await fill();
  await run(a, b);
  a.flags.paused = true;
  await run(a, b);
  a.flags.shared = false;
  await run(a, b);
  const text = JSON.stringify(commandsOf(a));
  const [pause, everything] = commandsOf(a);
  expect(pause).toEqual({
    entity: "HintWithdrawal",
    id: "hints",
    op: "upsert",
    fields: { from: { value: DAY, hlc: expect.any(String) as string } },
  });
  expect(everything).toMatchObject({ fields: { from: { value: "all" } } });
  expect(text).not.toMatch(/pause|consent|cycle|phase|period|panel/i);
  expect(text).not.toMatch(/Dzień|relief|scheduled/);
});

it("sends the hints of today and later to a new pair after the disconnect", async () => {
  const { a, fill } = await pair();
  await fill();
  await a.device.engine.push();
  // The pair is over: the local cleanup runs the handlers of the registry.
  await clearPairLocally({
    database: a.device.database,
    registry: a.registry,
    pairs: a.device.pairs,
    consent: { clear: () => Promise.resolve() },
  });

  const next = await createPairedDevices();
  for (const { id, value } of await a.device.database.list(HINTS)) {
    await next.a.database.put(HINTS, id, value);
  }
  const a2 = phone(next.a);
  const b2 = phone(next.b);
  a2.flags.shared = false;
  await run(a2, b2);
  expect(await texts(b2)).toEqual([]);

  a2.flags.shared = true;
  await run(a2, b2);
  expect(await texts(b2)).toEqual(["Dzień 0", "Dzień 1", "Dzień 2"]);
  expect(await b2.received.today()).toMatchObject({ text: "Dzień 0" });
});
