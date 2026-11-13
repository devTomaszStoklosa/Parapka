import { decryptEnvelope } from "@parapka/crypto";
import type { Clock } from "@parapka/domain";
import type { Envelope } from "@parapka/protocol";
import { expect, it } from "vitest";

import type { ConsentCategory } from "../consent/consent-model";
import { base64Decode } from "../sync/base64";
import { createPairedDevices, type Device } from "../sync/sync-test-support";
import { withCheckin } from "./checkin-test-support";

const WEEK = "2026-W45";
const answersA = { mood: 4, energy: 2, closeness: 5, need: "Spacer" };
const answersB = { mood: 1, energy: 3, closeness: 2 };

/** A pair where the test turns the consent of CHECKIN and the pause of A by hand. */
async function setup() {
  const state = { checkin: true, paused: false };
  const devices = await createPairedDevices();
  const clock: Clock = { nowMs: () => new Date("2026-11-12T12:00").getTime() };
  const { a, sodium } = devices;
  const gates = {
    isShared: (category: ConsentCategory) =>
      category !== "CHECKIN" || state.checkin,
    isPaused: () => state.paused,
  };
  const ua = withCheckin(a, sodium, clock, gates);
  const ub = withCheckin(devices.b, sodium, clock);
  const entities: string[] = [];
  a.restart({
    ...gates,
    registry: ua.registry,
    transport: {
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
          changes: { entity: string }[];
        };
        entities.push(...body.changes.map((change) => change.entity));
        return a.transport.send(envelope);
      },
    },
  });
  return { ...devices, ua, ub, state, entities };
}

async function rounds({ a, b }: { a: Device; b: Device }, count = 3) {
  for (let round = 0; round < count; round += 1) {
    await a.engine.sync();
    await b.engine.sync();
  }
}

const received = async (device: Device) =>
  (
    await Promise.all(
      ["checkin-sealed", "checkin-keys", "checkin-revealed"].map(
        async (name) => (await device.database.list(name)).length,
      ),
    )
  ).reduce((sum, count) => sum + count, 0);

const withdrawals = (entities: string[]) =>
  entities.filter((entity) => entity === "CheckInWithdrawal").length;

it("removes the revealed answers of A at B and keeps the ones of B at A", async () => {
  const pair = await setup();
  const { ua, ub, state, entities } = pair;
  await ua.service.submit(answersA);
  await ub.service.submit(answersB);
  await rounds(pair);
  expect(await ub.reveal.get(WEEK)).toEqual(answersA);
  expect(await ua.reveal.get(WEEK)).toEqual(answersB);
  state.checkin = false;
  await rounds(pair);
  expect(await ub.reveal.get(WEEK)).toBeNull();
  expect(await ub.sealed.partnerFilled(WEEK)).toBe(false);
  expect(await ub.keys.weeks()).toEqual([WEEK]); // only the own key
  expect(await ua.reveal.get(WEEK)).toEqual(answersB);
  expect(withdrawals(entities)).toBe(1);
});

it("removes the sealed version of A at B when B has not filled in", async () => {
  const pair = await setup();
  const { b, ua, ub, state } = pair;
  await ua.service.submit(answersA);
  await rounds(pair);
  expect(await ub.sealed.partnerFilled(WEEK)).toBe(true);
  state.checkin = false;
  await rounds(pair);
  expect(await ub.sealed.partnerFilled(WEEK)).toBe(false);
  expect(await received(b)).toBe(0);
});

it("sends the command once, during the pause too, and not again", async () => {
  const pair = await setup();
  const { ua, state, entities } = pair;
  await ua.service.submit(answersA);
  await rounds(pair);
  state.checkin = false;
  state.paused = true;
  await rounds(pair);
  await rounds(pair);
  expect(withdrawals(entities)).toBe(1);
});

it("sends no command when the consent was never on", async () => {
  const pair = await setup();
  const { state, entities } = pair;
  state.checkin = false;
  await rounds(pair);
  expect(withdrawals(entities)).toBe(0);
});

it("sends the open week anew when the consent is turned on again", async () => {
  const pair = await setup();
  const { ua, ub, state } = pair;
  await ua.service.submit(answersA);
  await ub.service.submit(answersB);
  await rounds(pair);
  state.checkin = false;
  await rounds(pair);
  expect(await ub.sealed.partnerFilled(WEEK)).toBe(false);
  state.checkin = true;
  await rounds(pair);
  expect(await ub.sealed.partnerFilled(WEEK)).toBe(true);
  expect(await ub.reveal.get(WEEK)).toEqual(answersA);
});
