import { afterEach, expect, it, vi } from "vitest";

import { wireCheckin } from "../checkin/wiring";
import { createMemoryDatabase } from "../data/memory-database";
import { createPairRepository } from "../pairing/pair-repository";
import { createMemoryKeyStore } from "../platform/memory-key-store";
import { createHandlerRegistry } from "../sync/handler-registry";
import { createSyncEngine } from "../sync/sync-engine";
import { createMemoryRelay } from "../sync/transport";
import {
  CYCLE,
  isRun,
  keys,
  SLOW,
  start,
  stoppers,
} from "../sync/wiring-test-support";
import {
  decryptedEnvelopes,
  privacyClock,
  setupCycleDevice,
} from "./cycle-test-support";
import { createHintHandler } from "./hint-sync";
import { createHintRepository, HINTS } from "./hint-repository";
import {
  createReceivedHintRepository,
  RECEIVED,
} from "./received-hint-repository";

afterEach(() => {
  for (const stop of stoppers.splice(0)) stop();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const FORBIDDEN = [
  "2026-10-04",
  "2026-11-01",
  "Boli mnie głowa",
  "Spaceru we dwoje",
  "menstruation",
  "follicular",
  "periovulatory",
  "luteal",
  "premenstrual",
  "energy",
  "mood",
  "tension",
  "tags",
  "note",
  "templateId",
  "contentVersion",
  "phase",
  "startDate",
];
const COLLECTIONS = [
  RECEIVED,
  HINTS,
  "sync-state",
  "sync-applied",
  "sync-held",
  "sync-errors",
  "pair",
  "partner-profile",
];

// B has no cycle: its engine takes the envelopes of A with a hint handler.
async function receiver(
  sodium: Parameters<typeof createSyncEngine>[0]["sodium"],
) {
  const database = createMemoryDatabase();
  const pairs = createPairRepository(database, createMemoryKeyStore());
  await pairs.savePending(
    {
      pairMailboxId: "mailbox-1",
      deviceId: "me",
      signingPublicKey: "s",
      agreementPublicKey: "a",
    },
    { sendKey: keys.receiveKey, receiveKey: keys.sendKey },
  );
  await pairs.confirm();
  const relay = createMemoryRelay();
  const received = createReceivedHintRepository({
    database,
    today: () => "2026-11-14",
  });
  const registry = createHandlerRegistry();
  registry.register(
    createHintHandler({
      hints: {
        sync: {} as never,
        subscribe: () => () => undefined,
        resendFrom: () => Promise.resolve(),
      },
      received,
      today: () => "2026-11-14",
    }),
  );
  const engine = createSyncEngine({
    database,
    pairs,
    identity: { deviceId: () => Promise.resolve("device-b") },
    sodium,
    clock: privacyClock,
    transport: relay.connect("device-b"),
    registry,
  });
  return { database, received, engine, partner: relay.connect("me") };
}

it(
  "puts only the four fields of a hint on the wire and nothing of the cycle in the base of the partner",
  async () => {
    const { set, cycle } = await setupCycleDevice();
    await cycle.savePeriod({
      id: "p1",
      startDate: "2026-10-04",
      endDate: "2026-10-08",
    });
    await cycle.savePeriod({
      id: "p2",
      startDate: "2026-11-01",
      endDate: null,
    });
    await cycle.saveWellbeing({
      date: "2026-11-14",
      energy: 1,
      mood: 2,
      tension: 5,
      desire: 3,
      tags: ["headache"],
      note: "Boli mnie głowa",
    });
    await wireCheckin({ ...set.platform, clock: privacyClock }).checkin.submit({
      mood: 3,
      energy: 3,
      closeness: 3,
      need: "Spaceru we dwoje",
    });
    // The generator of the device makes the hints after the changes above.
    const own = createHintRepository({
      database: set.platform.database,
      newId: () => "unused",
    });
    await vi.waitFor(async () => {
      expect(await own.range("2026-11-14", "2026-11-16")).toHaveLength(3);
    }, CYCLE);

    const sent = set.nextCall((call) => call.startsWith("POST") && isRun(call));
    start(set.controller);
    await sent;

    const contents = decryptedEnvelopes(set.sodium, set.postedBodies());
    const changes = contents.flatMap(
      (content) =>
        (
          JSON.parse(content) as {
            changes: { entity: string; fields?: object }[];
          }
        ).changes,
    );
    const hints = changes.filter(({ entity }) => entity === "Hint");
    expect(hints).toHaveLength(3);
    for (const { fields } of hints) {
      expect(Object.keys(fields ?? {}).sort()).toEqual([
        "category",
        "forDate",
        "status",
        "text",
      ]);
    }
    for (const content of contents) {
      for (const word of FORBIDDEN) expect(content).not.toContain(word);
    }

    const b = await receiver(set.sodium);
    for (const body of set.postedBodies()) {
      const { envelope } = JSON.parse(body) as { envelope: never };
      await b.partner.send(envelope);
    }
    await b.engine.pull();
    expect(await b.received.today()).not.toBeNull();
    const dump = JSON.stringify(
      await Promise.all(COLLECTIONS.map((name) => b.database.list(name))),
    );
    for (const word of FORBIDDEN) expect(dump).not.toContain(word);
  },
  SLOW,
);
