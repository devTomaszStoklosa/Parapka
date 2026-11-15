import { decryptEnvelope } from "@parapka/crypto";
import type { GeneratedHint } from "@parapka/domain";
import type { ContentChange, Envelope } from "@parapka/protocol";
import { expect, it } from "vitest";

import { defaultConsent } from "../consent/consent-model";
import { createConsentRepository } from "../consent/consent-repository";
import { UNKNOWN_CYCLE_SETTINGS } from "../data/cycle-settings";
import type { Profile } from "../data/profile";
import { createProfileRepository } from "../data/profile-repository";
import { base64Decode } from "../sync/base64";
import { createHandlerRegistry } from "../sync/handler-registry";
import { createPairedDevices, type Device } from "../sync/sync-test-support";
import { createCyclePanel } from "./cycle-panel";
import { createHintRepository } from "./hint-repository";
import { createHintHandler } from "./hint-sync";
import { createHintWithdrawalHandler } from "./hint-withdrawal";
import { createReceivedHintRepository } from "./received-hint-repository";

const DAY = "2026-11-14";

const PROFILE: Profile = {
  name: "Ola",
  form: "feminine",
  adultConfirmed: true,
  relationshipTenure: "1-3",
  hasChildren: false,
  childrenCount: 0,
  goals: [],
  otherGoalText: null,
  shareGoalsWithPartner: false,
  cycle: "yes",
  pinDecision: "skipped",
};

const HINT: GeneratedHint = {
  templateId: "t1",
  contentVersion: 3,
  category: "relief",
  date: DAY,
  text: "Dzień 0",
};

/** A device with the hints, the withdrawal and the panel over the real consent and profile. */
async function phone(device: Device, sent: Envelope[]) {
  const { database } = device;
  const profiles = createProfileRepository(database);
  const consent = createConsentRepository({
    database,
    clock: { nowMs: () => 1_000 },
    profiles,
  });
  await profiles.save(PROFILE);
  await consent.save({ ...defaultConsent(PROFILE), CYCLE_HINTS: true });
  const hints = createHintRepository({ database, newId: () => "hint-1" });
  const received = createReceivedHintRepository({ database, today: () => DAY });
  const registry = createHandlerRegistry();
  registry.register(
    createHintWithdrawalHandler({
      database,
      today: () => DAY,
      consent,
      pause: { isPaused: () => Promise.resolve(false) },
      hints,
      received,
    }),
  );
  registry.register(createHintHandler({ hints, received, today: () => DAY }));
  device.restart({
    registry,
    isShared: (category) => consent.isShared(category),
    transport: {
      ...device.transport,
      send: (envelope) => {
        sent.push(envelope);
        return device.transport.send(envelope);
      },
    },
  });
  return {
    hints,
    received,
    panel: createCyclePanel({ database, profiles, consent }),
  };
}

it("takes the hints of A from B and sends nothing but the command (FR-CYC-13)", async () => {
  const devices = await createPairedDevices();
  const sentByA: Envelope[] = [];
  const a = await phone(devices.a, sentByA);
  const b = await phone(devices.b, []);
  await a.panel.enable(UNKNOWN_CYCLE_SETTINGS);
  await devices.a.database.put("period-logs", "p1", {
    startDate: "2026-11-01",
  });
  await a.hints.put(HINT);
  await devices.a.engine.push();
  await devices.b.engine.pull();
  expect(await b.received.today()).toMatchObject({ text: "Dzień 0" });

  const before = sentByA.length;
  await a.panel.disable();
  await devices.a.engine.push();
  await devices.b.engine.pull();

  expect(await b.received.today()).toBeNull();
  expect(await devices.b.database.list("cycle-hints-received")).toEqual([]);
  const changes = sentByA.slice(before).flatMap((envelope) => {
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
  expect(changes).toEqual([
    {
      entity: "HintWithdrawal",
      id: "hints",
      op: "upsert",
      fields: { from: { value: "all", hlc: expect.any(String) as string } },
    },
  ]);
  expect(JSON.stringify(changes)).not.toMatch(/2026-11-01|Dzień|period/);
});
