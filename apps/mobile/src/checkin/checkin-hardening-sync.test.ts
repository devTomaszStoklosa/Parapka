import { sealCheckin } from "@parapka/crypto";
import { expect, it } from "vitest";

import { base64Decode, base64Encode } from "../sync/base64";
import { sendRaw } from "../sync/sync-test-support";
import { setupCheckinPair } from "./checkin-test-support";
import type { KeyRecord } from "./key-codec";
import type { SealedRecord } from "./sealed-codec";

const WEEK = "2026-W45";
const answersA = { mood: 4, energy: 2, closeness: 5 };
const answersB = { mood: 1, energy: 3, closeness: 2 };
const plain = (answers: object) =>
  new TextEncoder().encode(JSON.stringify(answers));

type Pair = Awaited<ReturnType<typeof setupCheckinPair>>;

const rows = async <T>(device: Pair["b"], collection: string) =>
  (await device.database.list(collection)).map((row) => row.value as T);

const hlc = "000000000000001-00000-device-a";
const fieldsOf = (values: Record<string, unknown>) =>
  Object.fromEntries(
    Object.entries(values).map(([name, value]) => [name, { value, hlc }]),
  );

const keyChange = (checkinId: string, version: number, key: Uint8Array) => ({
  entity: "CheckInKey",
  id: `${checkinId}|${String(version)}`,
  op: "upsert",
  fields: fieldsOf({ checkinId, version, key: base64Encode(key) }),
});

const sealedChange = (
  record: { checkinId: string; version: number } & object,
) => ({
  entity: "CheckIn",
  id: `${record.checkinId}|${String(record.version)}`,
  op: "upsert",
  fields: fieldsOf(record),
});

/** Sends the changes to B in one envelope of A. */
const send = (pair: Pair, id: string, change: object) =>
  sendRaw(pair, id, JSON.stringify({ schemaVersion: 1, changes: [change] }));

/** A well-formed sealed version of an author, with the key that opens it. */
function forge(pair: Pair, authorId: string, version: number, answers: object) {
  const checkinId = `${WEEK}:${authorId}`;
  const { key, sealed } = sealCheckin(
    pair.sodium,
    { checkinId, authorId, version },
    plain(answers),
  );
  const record = {
    checkinId,
    week: WEEK,
    authorId,
    version,
    nonce: base64Encode(sealed.nonce),
    ciphertext: base64Encode(sealed.ciphertext),
  };
  return { key, record };
}

it("takes in nothing from a device that is not the partner, and reveals nothing", async () => {
  const pair = await setupCheckinPair();
  const { b, ub } = pair;
  await ub.service.submit(answersB);
  const { key, record } = forge(pair, "device-c", 1, answersA);
  await send(pair, "e-sealed", sealedChange(record));
  await send(pair, "e-key", keyChange(record.checkinId, 1, key));
  await b.engine.sync();
  expect(
    (await rows<SealedRecord>(b, "checkin-sealed")).map((r) => r.own),
  ).toEqual([true]);
  expect((await rows<KeyRecord>(b, "checkin-keys")).map((r) => r.own)).toEqual(
    [],
  );
  expect(await ub.reveal.get(WEEK)).toBeNull();
});

it("reveals with the right key that follows a key with a changed byte", async () => {
  const pair = await setupCheckinPair();
  const { a, b, ua, ub } = pair;
  await ua.service.submit(answersA);
  await a.engine.sync();
  await b.engine.sync();
  const [own] = await rows<SealedRecord>(a, "checkin-sealed");
  const good = base64Decode(own?.sealKey as string);
  const bad = good.slice();
  bad[0] = (bad[0] ?? 0) ^ 1;
  await ub.service.submit(answersB);
  await send(pair, "e-bad", keyChange(own?.checkinId as string, 1, bad));
  await b.engine.sync();
  expect(await ub.reveal.get(WEEK)).toBeNull();
  for (let round = 0; round < 2; round += 1) {
    await a.engine.sync();
    await b.engine.sync();
  }
  expect(await ub.reveal.get(WEEK)).toEqual(answersA);
});

/** The key of version 1 and a later version 2 reach B in the given order. */
async function revealWithLaterVersion(order: ("key" | "v1" | "v2")[]) {
  const pair = await setupCheckinPair();
  const { b, ua, ub } = pair;
  await ua.service.submit(answersA);
  await ub.service.submit(answersB);
  const [own] = await rows<SealedRecord>(pair.a, "checkin-sealed");
  const sent = {
    key: keyChange(
      own?.checkinId as string,
      1,
      base64Decode(own?.sealKey as string),
    ),
    v1: sealedChange({ ...own } as SealedRecord),
    v2: sealedChange(forge(pair, own?.authorId as string, 2, answersB).record),
  };
  for (const [index, name] of order.entries()) {
    await send(pair, `e-${String(index)}`, sent[name]);
  }
  await b.engine.sync();
  return ub.reveal.get(WEEK);
}

it("reveals version 1 when version 2 comes after its key but before it", async () => {
  expect(await revealWithLaterVersion(["key", "v2", "v1"])).toEqual(answersA);
});

it("reveals version 1 when version 2 comes after it but before the reveal", async () => {
  expect(await revealWithLaterVersion(["v1", "v2", "key"])).toEqual(answersA);
});
