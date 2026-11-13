import { decryptEnvelope } from "@parapka/crypto";
import { ChoreValidationError } from "@parapka/domain";
import type { Envelope } from "@parapka/protocol";
import { expect, it } from "vitest";

import { base64Decode, base64Encode } from "../sync/base64";
import { sendRaw, type Device } from "../sync/sync-test-support";
import { setupCheckinPair } from "./checkin-test-support";
import type { KeyRecord } from "./key-codec";
import type { SealedRecord } from "./sealed-codec";

const WEEK = "2026-W45";
const answersA = { mood: 4, energy: 2, closeness: 5, need: "Spacer" };
const answersB = { mood: 1, energy: 3, closeness: 2 };

/** A few rounds, so that every message reaches the other side. */
async function rounds({ a, b }: { a: Device; b: Device }, count = 3) {
  for (let round = 0; round < count; round += 1) {
    await a.engine.sync();
    await b.engine.sync();
  }
}

const rows = async <T>(device: Device, collection: string) =>
  (await device.database.list(collection)).map((row) => row.value as T);

/** Records what A sends, as the decrypted entities and ids. */
function listenTo(pair: Awaited<ReturnType<typeof setupCheckinPair>>) {
  const { a, ua, sodium } = pair;
  const seen: { entity: string; id: string }[] = [];
  const wire = {
    ...a.transport,
    send: (envelope: Envelope) => {
      const text = decryptEnvelope(
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
      );
      const body = JSON.parse(new TextDecoder().decode(text)) as {
        changes: { entity: string; id: string }[];
      };
      seen.push(...body.changes);
      return a.transport.send(envelope);
    },
  };
  a.restart({ registry: ua.registry, transport: wire });
  return seen;
}

it("reveals the answers to both when A fills in first", async () => {
  const pair = await setupCheckinPair();
  const { ua, ub } = pair;
  await ua.service.submit(answersA);
  await ub.service.submit(answersB);
  await rounds(pair);
  expect(await ua.service.current()).toMatchObject({
    status: "revealed",
    partner: answersB,
  });
  expect(await ub.service.current()).toMatchObject({
    status: "revealed",
    partner: answersA,
  });
});

it("reveals the answers to both when B fills in first", async () => {
  const pair = await setupCheckinPair();
  const { ua, ub } = pair;
  await ub.service.submit(answersB);
  await ua.service.submit(answersA);
  await rounds(pair);
  expect(await ua.service.current()).toMatchObject({
    status: "revealed",
    partner: answersB,
  });
  expect(await ub.service.current()).toMatchObject({
    status: "revealed",
    partner: answersA,
  });
});

it("reveals the last version of A when A edits before B receives", async () => {
  const pair = await setupCheckinPair();
  const { ua, ub } = pair;
  await ua.service.submit(answersA);
  await ua.service.submit({ ...answersA, mood: 2 });
  await ub.service.submit(answersB);
  await rounds(pair);
  expect(await ub.service.current()).toMatchObject({
    status: "revealed",
    partner: { ...answersA, mood: 2 },
  });
});

it("locks B at once when B fills in after A, and A after the version of B", async () => {
  const pair = await setupCheckinPair();
  const { a, b, ua, ub } = pair;
  await ua.service.submit(answersA);
  await a.engine.sync();
  await b.engine.sync();
  await ub.service.submit(answersB);
  expect((await ub.service.current()).status).toBe("locked");
  await expect(ub.service.submit(answersB)).rejects.toThrow(
    ChoreValidationError,
  );
  expect((await ua.service.current()).status).toBe("filled");
  await b.engine.sync();
  await a.engine.sync();
  await expect(ua.service.submit(answersA)).rejects.toThrow(
    ChoreValidationError,
  );
});

it("sends no key and reveals nothing while only A has filled in", async () => {
  const pair = await setupCheckinPair();
  const { b, ua, ub } = pair;
  const seen = listenTo(pair);
  await ua.service.submit(answersA);
  await rounds(pair);
  expect(seen.map((change) => change.entity)).toEqual(["CheckIn"]);
  expect(await rows(b, "checkin-keys")).toEqual([]);
  expect(await ub.service.current()).toMatchObject({
    status: "open",
    partner: null,
  });
});

it("sends the key of the newest own version once, when the check-in is locked", async () => {
  const pair = await setupCheckinPair();
  const { ua, ub } = pair;
  const seen = listenTo(pair);
  await ua.service.submit(answersA);
  await ua.service.submit({ ...answersA, mood: 3 });
  await ub.service.submit(answersB);
  await rounds(pair, 4);
  expect(seen.map((change) => `${change.entity} ${change.id}`)).toEqual([
    "CheckIn 2026-W45:device-a|2",
    "CheckInKey 2026-W45:device-a|2",
  ]);
});

it("keeps the key of A back during the pause and reveals after it", async () => {
  let paused = false;
  const pair = await setupCheckinPair({ isPaused: () => paused });
  const { a, b, ua, ub } = pair;
  await ua.service.submit(answersA);
  await a.engine.sync();
  await b.engine.sync();
  paused = true;
  await ub.service.submit(answersB);
  await rounds(pair);
  expect((await ub.service.current()).status).toBe("locked");
  expect(await rows(b, "checkin-keys")).toHaveLength(1);
  paused = false;
  await rounds(pair);
  expect(await ub.service.current()).toMatchObject({
    status: "revealed",
    partner: answersA,
  });
  expect((await ua.service.current()).status).toBe("revealed");
});

it("reveals nothing for a key with a changed byte, and still syncs", async () => {
  const pair = await setupCheckinPair();
  const { a, b, ua, ub, sodium } = pair;
  await ua.service.submit(answersA);
  await a.engine.sync();
  await b.engine.sync();
  await ub.service.submit(answersB);
  const [own] = await rows<SealedRecord>(a, "checkin-sealed");
  const bytes = base64Decode(own?.sealKey as string);
  bytes[0] = (bytes[0] ?? 0) ^ 1;
  const field = (value: unknown) => ({
    value,
    hlc: "000000000000001-00000-device-a",
  });
  const change = {
    entity: "CheckInKey",
    id: "2026-W45:device-a|1",
    op: "upsert",
    fields: {
      checkinId: field("2026-W45:device-a"),
      version: field(1),
      key: field(base64Encode(bytes)),
    },
  };
  await sendRaw(
    { a, sodium },
    "e-key",
    JSON.stringify({ schemaVersion: 1, changes: [change] }),
  );
  await b.engine.sync();
  expect(await ub.service.current()).toMatchObject({
    status: "locked",
    partner: null,
  });
  expect(await rows<KeyRecord>(b, "checkin-keys")).toHaveLength(2);
});

it("forgets the received keys and the revealed answers, and keeps the own keys", async () => {
  const pair = await setupCheckinPair();
  const { b, ua, ub } = pair;
  await ua.service.submit(answersA);
  await ub.service.submit(answersB);
  await rounds(pair);
  expect(await rows(b, "checkin-keys")).toHaveLength(2);
  await ub.registry.get("CheckInKey")?.forgetReceived?.();
  expect((await rows<KeyRecord>(b, "checkin-keys")).map((k) => k.own)).toEqual([
    true,
  ]);
  expect(await ub.reveal.get(WEEK)).toBeNull();
});
