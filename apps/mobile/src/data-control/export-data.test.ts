import type { Sodium } from "@parapka/crypto";
import { createHlc, formatHlc } from "@parapka/sync";
import { beforeAll, describe, expect, it } from "vitest";

import { createAnswersRepository } from "../checkin/answers-repository";
import { createScheduleRepository } from "../checkin/schedule-repository";
import { createChoreRepository } from "../chores/chore-repository";
import { createCompletionRepository } from "../chores/completion-repository";
import { createConsentRepository } from "../consent/consent-repository";
import { createCycleRepository } from "../cycle/cycle-repository";
import { createHintFeedbackRepository } from "../cycle/hint-feedback-repository";
import { createHintReactionRepository } from "../cycle/hint-reaction-repository";
import { createHintRepository } from "../cycle/hint-repository";
import { createReceivedHintRepository } from "../cycle/received-hint-repository";
import { createWellbeingRepository } from "../cycle/wellbeing-repository";
import { createCycleSettingsRepository } from "../data/cycle-settings";
import type { LocalDatabase } from "../data/local-database";
import { createMemoryDatabase } from "../data/memory-database";
import type { Profile } from "../data/profile";
import { createProfileRepository } from "../data/profile-repository";
import { createCarrierRepository } from "../head/carrier-repository";
import { createHandoverRepository } from "../head/handover-repository";
import { createItemRepository } from "../head/item-repository";
import { createIdentity } from "../identity/identity";
import { createPinStore } from "../lock/pin-store";
import { createNotificationSettingsRepository } from "../notifications/notification-settings";
import { createPairRepository } from "../pairing/pair-repository";
import { createMemoryKeyStore } from "../platform/memory-key-store";
import { createWebSodium } from "../platform/web-sodium";
import { createActivityLog } from "../research/activity-log";
import { createPartnerProfileRepository } from "../sync/partner-profile-repository";
import {
  buildExport,
  EXPORTED_COLLECTIONS,
  SKIPPED_COLLECTIONS,
} from "./export-data";

const NOW = new Date(2026, 10, 16, 12).getTime();
const clock = { nowMs: () => NOW };
const OWN = "OWNDEVICEID";
const PARTNER = "PARTNERDEVICEID";
const hlc = (deviceId: string) => formatHlc(createHlc(NOW, 0, deviceId));
const field = (value: unknown) => ({ value, hlc: hlc(PARTNER) });
const profile = { name: "Ola", cycle: "yes" } as unknown as Profile;

let sodium: Sodium;
beforeAll(async () => {
  sodium = await createWebSodium();
});

/** A database that remembers every collection that was written to. */
function recordingDatabase() {
  const inner = createMemoryDatabase();
  const written = new Set<string>();
  const database: LocalDatabase = {
    ...inner,
    put: (collection, id, value) => {
      written.add(collection);
      return inner.put(collection, id, value);
    },
  };
  return { database, written };
}

/** A database filled by the real repositories and a few raw records. */
async function filledDatabase() {
  const { database, written } = recordingDatabase();
  const keyStore = createMemoryKeyStore();
  const identity = createIdentity({
    sodium,
    keyStore,
    database,
    relay: () => ({ registerDevice: () => Promise.resolve({ deviceId: OWN }) }),
  });
  await identity.init();
  const pairs = createPairRepository(database, keyStore);
  await pairs.savePending(
    {
      pairMailboxId: "MAILBOX-MARKER",
      deviceId: PARTNER,
      signingPublicKey: "PARTNER-SIGNING-MARKER",
      agreementPublicKey: "PARTNER-AGREEMENT-MARKER",
    },
    { sendKey: Uint8Array.from([7, 7]), receiveKey: Uint8Array.from([8, 8]) },
  );
  await pairs.confirm();
  await createPinStore({ database, sodium, clock }).setPin("123456");

  const profiles = createProfileRepository(database);
  await profiles.save(profile);
  await createConsentRepository({ database, clock, profiles }).save({
    CYCLE_HINTS: true,
    CHECKIN: true,
    SHARED_CHORES: true,
    SHARED_MENTAL_LOAD: true,
    ONBOARDING_GOALS: false,
  });
  await createNotificationSettingsRepository(database).set({ discreet: false });
  await createActivityLog(database).recordOpen(NOW);
  await createCycleSettingsRepository(database).save({
    unknown: false,
    lastPeriodStart: "2026-11-01",
    cycleLength: 29,
    periodLength: 5,
  });
  await createCycleRepository(database).putPeriod({
    id: "p-1",
    startDate: "2026-10-03",
    endDate: "2026-10-08",
  });
  await createWellbeingRepository(database).put({
    date: "2026-11-15",
    energy: 3,
    mood: 4,
    tension: 2,
    tags: [],
    note: "OWN-WELLBEING-NOTE",
  });
  await createHintRepository({ database, newId: () => "hint-own" }).put({
    templateId: "TEMPLATE-MARKER",
    contentVersion: 1,
    category: "relief",
    date: "2026-11-16",
    text: "OWN-HINT-TEXT",
  });
  await createHintReactionRepository(database).set("hint-partner", "done");
  await createHintFeedbackRepository(database).save("2026-11-16", 4, 5);
  await createAnswersRepository(database).put({
    week: "2026-W47",
    answers: { mood: 4, energy: 3, closeness: 5, need: "OWN-NEED" },
    submittedAt: NOW,
  });
  await createScheduleRepository({ database, pairs }).set({
    weekday: 5,
    hour: 18,
    minute: 30,
  });
  await fillSharedData(database, pairs);
  await fillPartnerData(database);
  return { database, written, identity };
}

async function fillSharedData(
  database: LocalDatabase,
  pairs: ReturnType<typeof createPairRepository>,
) {
  let n = 0;
  const choreDeps = (deviceId: string) => ({
    database,
    pairs,
    identity: { deviceId: () => Promise.resolve(deviceId) },
    newId: () => `chore-${String((n += 1))}`,
  });
  const chores = createChoreRepository(choreDeps(OWN));
  const own = await chores.add({
    title: "OWN-CHORE",
    rule: { kind: "daily" },
    assignment: { kind: "person", person: "me" },
  });
  await chores.sync.merge({
    entity: "Chore",
    id: "chore-partner",
    op: "upsert",
    fields: {
      title: field("PARTNER-CHORE"),
      rule: field({ kind: "daily" }),
      assignment: field({ kind: "person", deviceId: PARTNER }),
    },
  });
  await createCompletionRepository({
    database,
    chores,
    identity: { deviceId: () => Promise.resolve(OWN) },
    clock,
  }).complete(own.id, "2026-11-15");

  const item = await createItemRepository({
    database,
    pairs,
    clock,
    newId: () => "item-1",
  }).add({ title: "OWN-ITEM" });
  const identity = { deviceId: () => Promise.resolve(PARTNER) };
  const carriers = createCarrierRepository({ database, identity, clock });
  await carriers.append({ itemId: item.id, carrier: PARTNER, shared: true });
  await carriers.append({ itemId: "item-2", carrier: "both", shared: true });
  await createHandoverRepository({ database, identity, clock }).append({
    requestId: "req-1",
    itemId: item.id,
    requestedBy: PARTNER,
    status: "pending",
    shared: true,
  });
}

/** What came from the partner or is a secret; none of it may be exported. */
async function fillPartnerData(database: LocalDatabase) {
  await createReceivedHintRepository({
    database,
    today: () => "2026-11-16",
  }).merge({
    entity: "Hint",
    id: "hint-partner",
    op: "upsert",
    fields: {
      forDate: field("2026-11-16"),
      text: field("PARTNER-HINT-TEXT"),
      category: field("relief"),
      status: field("scheduled"),
    },
  });
  await createPartnerProfileRepository(database).merge({
    name: field("PARTNER-NAME"),
    form: field("neutral"),
  });
  const raw = [
    ["checkin-revealed", { mood: 1, need: "PARTNER-NEED" }],
    ["checkin-sealed", { ciphertext: "SEALED-MARKER" }],
    ["checkin-keys", { key: "CHECKIN-KEY-MARKER" }],
  ] as const;
  for (const [collection, value] of raw) {
    await database.put(collection, "2026-W47", value);
  }
}

describe("buildExport", () => {
  it("holds the own and the shared data", async () => {
    const { database } = await filledDatabase();
    const document = await buildExport({ database, clock });
    expect(document).toMatchObject({
      format: "parapka-export",
      version: 1,
      exportedAt: new Date(NOW).toISOString(),
    });
    expect(document.profile).toEqual(profile);
    expect(document.consent).toMatchObject({ textVersion: 1, savedAtMs: NOW });
    expect(document.cycleSettings).toMatchObject({ cycleLength: 29 });
    expect(document.periodLogs).toHaveLength(2);
    expect(document.wellbeingEntries).toHaveLength(1);
    expect(document.ownHints).toMatchObject([
      { id: "hint-own", text: "OWN-HINT-TEXT" },
    ]);
    expect(document.hintReactions).toHaveLength(1);
    expect(document.hintSurvey).toHaveLength(1);
    expect(document.checkinAnswers).toHaveLength(1);
    expect(document.checkinSchedule).toEqual({
      checkInDay: 5,
      checkInTime: "18:30",
    });
    expect(document.notificationSettings).toMatchObject({ discreet: false });
    expect(document.activityLog).toEqual([{ date: "2026-11-16" }]);

    // The people are named instead of the devices.
    expect(document.chores).toMatchObject([
      { title: "OWN-CHORE", assignment: { kind: "person", person: "me" } },
      {
        title: "PARTNER-CHORE",
        assignment: { kind: "person", person: "partner" },
      },
    ]);
    expect(document.choreCompletions).toMatchObject([{ completedBy: "me" }]);
    expect(document.mentalLoadItems).toMatchObject([{ title: "OWN-ITEM" }]);
    expect(document.carrierChanges).toMatchObject([
      { carrier: "partner", changedBy: "partner" },
      { carrier: "both", changedBy: "partner" },
    ]);
    expect(document.handoverRequests).toMatchObject([
      { requestedBy: "partner", status: "pending" },
    ]);
  });

  it("keeps the partner out of a clean JSON", async () => {
    const { database } = await filledDatabase();
    const document = await buildExport({ database, clock });
    const text = JSON.stringify(document);
    expect(JSON.parse(text)).toEqual(document);
    for (const name of ['"state":', '"pending":', '"hlc":', '"deletedAt":']) {
      expect(text).not.toContain(name);
    }
    for (const marker of [
      "PARTNER-HINT-TEXT",
      "PARTNER-NEED",
      "PARTNER-NAME",
      "SEALED-MARKER",
      "TEMPLATE-MARKER",
      OWN,
      PARTNER,
      "MAILBOX-MARKER",
    ]) {
      expect(text).not.toContain(marker);
    }
  });

  it("keeps keys, secrets and the PIN out of the document", async () => {
    const { database, identity } = await filledDatabase();
    const text = JSON.stringify(await buildExport({ database, clock }));
    const pin = (await database.list("lock")).flatMap(({ value }) =>
      Object.values(value as Record<string, unknown>).filter(
        (field): field is string => typeof field === "string",
      ),
    );
    const secrets = [
      ...Object.values((await identity.publicKeys()) ?? {}).map(String),
      ...pin,
      "PARTNER-SIGNING-MARKER",
      "PARTNER-AGREEMENT-MARKER",
      "CHECKIN-KEY-MARKER",
    ];
    expect(secrets.length).toBeGreaterThan(5);
    for (const secret of secrets) expect(text).not.toContain(secret);
  });

  it("classifies every collection that the repositories wrote", async () => {
    const { written } = await filledDatabase();
    const classified = [...EXPORTED_COLLECTIONS, ...SKIPPED_COLLECTIONS];
    expect([...written].filter((c) => !classified.includes(c))).toEqual([]);
  });
});
