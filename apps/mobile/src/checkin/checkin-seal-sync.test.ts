import { decryptEnvelope, unsealCheckin } from "@parapka/crypto";
import type { Envelope } from "@parapka/protocol";
import { expect, it, vi } from "vitest";

const touched = vi.hoisted(() => new Set<string>());

vi.mock("../data/memory-database", async (original) => {
  const module = await original<typeof import("../data/memory-database")>();
  return {
    ...module,
    createMemoryDatabase: () => {
      const database = module.createMemoryDatabase();
      const put = database.put.bind(database);
      database.put = (collection, id, value) => {
        touched.add(collection);
        return put(collection, id, value);
      };
      return database;
    },
  };
});

import { base64Decode } from "../sync/base64";
import { sendRaw } from "../sync/sync-test-support";
import { setupCheckinPair } from "./checkin-test-support";
import type { SealedRecord } from "./sealed-codec";

const NEED = "Spaceru we dwoje";
const answers = { mood: 4, energy: 2, closeness: 5, need: NEED };
const WEEK = "2026-W45";

const dump = async (database: {
  list(collection: string): Promise<unknown[]>;
}) => database.list("checkin-sealed");

async function records(device: { database: Parameters<typeof dump>[0] }) {
  return ((await dump(device.database)) as { value: SealedRecord }[]).map(
    (row) => row.value,
  );
}

it("gives B the ciphertext only, which only the key of A opens (FR-CHK-03)", async () => {
  const { a, b, ua, ub, sodium } = await setupCheckinPair();
  await ua.service.submit(answers);
  await a.engine.sync();
  await b.engine.sync();
  const [own] = await records(a);
  const [received] = await records(b);
  expect(received).toMatchObject({ version: 1, own: false, sealKey: null });
  const everything = JSON.stringify(
    await Promise.all([...touched].map((name) => b.database.list(name))),
  );
  expect(everything).not.toContain(NEED);
  expect(everything).not.toContain(own?.sealKey);
  const key = base64Decode(own?.sealKey as string);
  const partner = await ub.sealed.latestPartner(WEEK);
  const plain = unsealCheckin(
    sodium,
    key,
    {
      checkinId: `${WEEK}:device-a`,
      authorId: "device-a",
      version: 1,
    },
    partner as NonNullable<typeof partner>,
  );
  expect(JSON.parse(new TextDecoder().decode(plain))).toEqual(answers);
  expect(await ub.sealed.partnerFilled(WEEK)).toBe(true);
  expect(await ub.sealed.partnerFilled("2026-W44")).toBe(false);
});

it("looks the same to B whether A has filled in or not (ZP-2)", async () => {
  const { a, b, ua, ub } = await setupCheckinPair();
  const before = await ub.service.current();
  await ua.service.submit(answers);
  await a.engine.sync();
  await b.engine.sync();
  const after = await ub.service.current();
  expect(after).toEqual(before);
  expect(after).toMatchObject({ status: "open", partner: null });
});

it("sends only the newest of the versions edited before the sync", async () => {
  const { a, b, ua } = await setupCheckinPair();
  await ua.service.submit(answers);
  await ua.service.submit({ ...answers, mood: 3 });
  await ua.service.submit({ ...answers, mood: 2 });
  await a.engine.sync();
  await b.engine.sync();
  expect((await records(b)).map((r) => r.version)).toEqual([3]);
  await a.engine.sync();
  await b.engine.sync();
  expect((await records(b)).map((r) => r.version)).toEqual([3]);
});

it("replaces version 1 with 2 when A edits after the send", async () => {
  const { a, b, ua } = await setupCheckinPair();
  await ua.service.submit(answers);
  await a.engine.sync();
  await b.engine.sync();
  await ua.service.submit({ ...answers, mood: 1 });
  await a.engine.sync();
  await b.engine.sync();
  expect((await records(b)).map((r) => r.version)).toEqual([2]);
});

it("keeps back the answers without the consent and sends them after it", async () => {
  let shared = false;
  const { a, b, ua } = await setupCheckinPair({ isShared: () => shared });
  await ua.service.submit(answers);
  await a.engine.sync();
  await b.engine.sync();
  expect(await records(b)).toEqual([]);
  shared = true;
  await a.engine.sync();
  await b.engine.sync();
  expect((await records(b)).map((r) => r.version)).toEqual([1]);
});

it("keeps back the answers during the pause and sends them after it", async () => {
  let paused = true;
  const { a, b, ua } = await setupCheckinPair({ isPaused: () => paused });
  await ua.service.submit(answers);
  await a.engine.sync();
  await b.engine.sync();
  expect(await records(b)).toEqual([]);
  paused = false;
  await a.engine.sync();
  await b.engine.sync();
  expect((await records(b)).map((r) => r.version)).toEqual([1]);
});

it("skips the entries of the partner that are replaced or damaged", async () => {
  const { a, b, ua, sodium } = await setupCheckinPair();
  await ua.service.submit(answers);
  const [own] = await records(a);
  const good = {
    checkinId: own?.checkinId,
    week: own?.week,
    authorId: own?.authorId,
    version: 1,
    nonce: own?.nonce,
    ciphertext: own?.ciphertext,
  };
  const change = (id: string, fields: Record<string, unknown>) => ({
    entity: "CheckIn",
    id,
    op: "upsert",
    fields: Object.fromEntries(
      Object.entries(fields).map(([k, value]: [string, unknown]) => [
        k,
        { value, hlc: "000000000000001-00000-device-a" },
      ]),
    ),
  });
  const id = "2026-W45:device-a|1";
  const bad = [
    change(id, { ...good, authorId: "device-b" }),
    change(id, { ...good, authorId: "device-x" }),
    change(id, { ...good, ciphertext: "not base64!" }),
    change(id, { ...good, nonce: "AAAA" }),
    change(id, { ...good, version: 0 }),
    change(id, { ...good, version: 1.5 }),
    change(id, { ...good, week: "W45" }),
    {
      entity: "CheckIn",
      id,
      op: "delete",
      hlc: "000000000000001-00000-device-a",
    },
    change(id, good),
  ];
  for (const [index, item] of bad.entries()) {
    await sendRaw(
      { a, sodium },
      `e-${String(index)}`,
      JSON.stringify({ schemaVersion: 1, changes: [item] }),
    );
  }
  await b.engine.sync();
  // Only the last, intact entry is taken in.
  expect((await records(b)).map((r) => r.version)).toEqual([1]);
});

it("keeps the newest version when an older one arrives later", async () => {
  const { a, b, ua, ub, sodium } = await setupCheckinPair();
  await ua.service.submit(answers);
  await a.engine.sync();
  await b.engine.sync();
  const [first] = await records(b);
  await ua.service.submit({ ...answers, mood: 1 });
  await a.engine.sync();
  await b.engine.sync();
  const old = {
    entity: "CheckIn",
    id: "2026-W45:device-a|1",
    op: "upsert",
    fields: Object.fromEntries(
      Object.entries(first as SealedRecord)
        .filter(([k]) =>
          [
            "checkinId",
            "week",
            "authorId",
            "version",
            "nonce",
            "ciphertext",
          ].includes(k),
        )
        .map(([k, value]: [string, unknown]) => [
          k,
          { value, hlc: "000000000000001-00000-device-a" },
        ]),
    ),
  };
  await sendRaw(
    { a, sodium },
    "e-old",
    JSON.stringify({ schemaVersion: 1, changes: [old] }),
  );
  await b.engine.sync();
  expect((await ub.sealed.latestPartner(WEEK))?.version).toBe(2);
});

it("forgets the received versions and keeps the own ones", async () => {
  const { a, b, ua, ub } = await setupCheckinPair();
  await ua.service.submit(answers);
  await ub.service.submit(answers);
  await a.engine.sync();
  await b.engine.sync();
  await a.engine.sync();
  expect(await records(b)).toHaveLength(2);
  await ub.registry.get("CheckIn")?.forgetReceived?.();
  expect((await records(b)).map((r) => r.own)).toEqual([true]);
});

it("puts nothing of the answers or the key on the wire", async () => {
  const { a, b, ua, sodium } = await setupCheckinPair();
  const sent: Envelope[] = [];
  const wire = {
    ...a.transport,
    send: (envelope: Envelope) => {
      sent.push(envelope);
      return a.transport.send(envelope);
    },
  };
  a.restart({ registry: ua.registry, transport: wire });
  await ua.service.submit(answers);
  await ua.service.submit({ ...answers, mood: 3 });
  await a.engine.sync();
  await b.engine.sync();
  const [own] = await records(a);
  const latest = (await records(a)).at(-1) as SealedRecord;
  const texts = sent.map((envelope) =>
    new TextDecoder().decode(
      decryptEnvelope(
        sodium,
        a.keys.sendKey,
        {
          envelopeId: envelope.envelopeId,
          pairMailboxId: envelope.pairMailboxId,
          senderDeviceId: envelope.senderDeviceId,
          protocolVersion: envelope.protocolVersion,
        },
        {
          nonce: base64Decode(envelope.nonce),
          ciphertext: base64Decode(envelope.ciphertext),
        },
      ),
    ),
  );
  const joined = texts.join("");
  for (const forbidden of [
    "mood",
    "energy",
    "closeness",
    "need",
    NEED,
    own?.sealKey,
    latest.sealKey,
  ]) {
    expect(joined).not.toContain(forbidden as string);
  }
  const checkIns = texts.flatMap((text) =>
    (
      JSON.parse(text) as { changes: { entity: string; id: string }[] }
    ).changes.filter((change) => change.entity === "CheckIn"),
  );
  expect(checkIns.map((change) => change.id)).toEqual(["2026-W45:device-a|2"]);
});
