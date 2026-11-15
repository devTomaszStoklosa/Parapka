import { decryptEnvelope } from "@parapka/crypto";
import type { ContentChange, Envelope } from "@parapka/protocol";
import { expect, it } from "vitest";

import { createProfileRepository } from "../data/profile-repository";
import { base64Decode } from "../sync/base64";
import { createHandlerRegistry } from "../sync/handler-registry";
import { createPairedDevices, type Device } from "../sync/sync-test-support";
import { profile } from "../sync/wiring-test-support";
import { loadContent } from "./content";
import { createCycleRepository } from "./cycle-repository";
import { createCycleService } from "./cycle-service";
import { createHintChoice } from "./hint-choice";
import { createHintGenerator } from "./hint-generator";
import { createHintHandler } from "./hint-sync";
import { createHintRepository } from "./hint-repository";
import { createReceivedHintRepository } from "./received-hint-repository";
import { createWellbeingRepository } from "./wellbeing-repository";

const DAY = "2026-11-08";

// A device with a hint handler; the sender also records what it sends.
function connect(device: Device, sent: Envelope[]) {
  let counter = 0;
  const hints = createHintRepository({
    database: device.database,
    newId: () => `${device.id}-h${String(++counter)}`,
  });
  const received = createReceivedHintRepository({
    database: device.database,
    today: () => DAY,
  });
  const registry = createHandlerRegistry();
  registry.register(createHintHandler({ hints, received, today: () => DAY }));
  device.restart({
    registry,
    isShared: () => true,
    isPaused: () => false,
    transport: {
      ...device.transport,
      send: (envelope) => {
        sent.push(envelope);
        return device.transport.send(envelope);
      },
    },
  });
  return { hints, received };
}

async function pair() {
  const { a, b, sodium } = await createPairedDevices();
  const sent: Envelope[] = [];
  const own = connect(a, sent);
  const partner = connect(b, []);
  const clock = { nowMs: () => new Date(2026, 10, 8, 12).getTime() };
  const cycle = createCycleService({
    clock,
    repository: createCycleRepository(a.database),
    wellbeing: createWellbeingRepository(a.database),
  });
  const profiles = createProfileRepository(a.database);
  await profiles.save({ ...profile, cycle: "yes" });
  const deps = {
    cycle,
    checkin: { hintCheckin: () => Promise.resolve(null) },
    hints: own.hints,
    profiles,
    library: () => loadContent(),
  };
  await cycle.savePeriod({ id: "p1", startDate: "2026-11-01", endDate: null });
  await createHintGenerator(deps).refresh();
  const changes = () =>
    sent.splice(0).flatMap((envelope) => {
      const { nonce, ciphertext, ...fields } = envelope;
      const plain = decryptEnvelope(sodium, a.keys.sendKey, fields, {
        nonce: base64Decode(nonce),
        ciphertext: base64Decode(ciphertext),
      });
      const content = JSON.parse(new TextDecoder().decode(plain)) as {
        changes: ContentChange[];
      };
      return content.changes;
    });
  const sync = async () => {
    await a.engine.push();
    await b.engine.pull();
  };
  await sync();
  changes();
  return {
    choice: createHintChoice(deps),
    received: partner.received,
    changes,
    sync,
  };
}

const fieldsOf = (changes: ContentChange[]) =>
  changes.map((change) =>
    change.op === "upsert" ? Object.keys(change.fields).sort() : [change.op],
  );

const FOUR = [["category", "forDate", "status", "text"]];

it("sends a skip as the four fields and the partner sees no hint", async () => {
  const { choice, received, changes, sync } = await pair();
  expect(await received.today()).toMatchObject({ status: "scheduled" });
  await choice.skip(DAY);
  await sync();
  expect(fieldsOf(changes())).toEqual(FOUR);
  expect(await received.today()).toMatchObject({ status: "skipped" });
  await choice.restore(DAY);
  await sync();
  expect(await received.today()).toMatchObject({ status: "scheduled" });
});

it("sends a chosen hint without the template or the candidates", async () => {
  const { choice, received, changes, sync } = await pair();
  const [, second] = await choice.candidates(DAY);
  expect(await choice.choose(DAY, second?.templateId ?? "")).toBe(true);
  await sync();
  const sent = changes();
  expect(fieldsOf(sent)).toEqual(FOUR);
  expect(await received.today()).toMatchObject({
    text: second?.text,
    status: "scheduled",
  });
  const plain = JSON.stringify(sent);
  expect(plain).not.toContain(second?.templateId ?? "unreachable");
  expect(plain).not.toContain("candidates");
});
