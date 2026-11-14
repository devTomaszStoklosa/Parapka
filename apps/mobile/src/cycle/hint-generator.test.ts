import {
  createUuid7Generator,
  type CheckinAnswers,
  type HintCheckin,
} from "@parapka/domain";
import { describe, expect, it } from "vitest";

import forbidden from "../../../../content/forbidden-phrases.json";
import {
  findPhrases,
  parseForbiddenLists,
} from "../../../../packages/content/src/forbidden";
import { createMemoryDatabase } from "../data/memory-database";
import type { Profile } from "../data/profile";
import { createProfileRepository } from "../data/profile-repository";
import { loadContent } from "./content";
import { createCycleRepository } from "./cycle-repository";
import { createCycleService } from "./cycle-service";
import { createHintGenerator } from "./hint-generator";
import { addDays, createHintRepository, HINTS } from "./hint-repository";
import { createWellbeingRepository } from "./wellbeing-repository";

const profile: Profile = {
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

const scoreOf = (energy: number) =>
  ({ mood: 3, energy, closeness: 3 }) as unknown as CheckinAnswers;

function setup(
  options: { library?: () => ReturnType<typeof loadContent> } = {},
) {
  const database = createMemoryDatabase();
  const time = { nowMs: new Date(2026, 10, 8, 12).getTime() };
  const clock = { nowMs: () => time.nowMs };
  const cycle = createCycleService({
    clock,
    repository: createCycleRepository(database),
    wellbeing: createWellbeingRepository(database),
  });
  let counter = 0;
  const hints = createHintRepository({
    database,
    newId: createUuid7Generator({
      clock,
      random: { bytes: (length) => new Uint8Array(length).fill(++counter) },
    }),
  });
  const profiles = createProfileRepository(database);
  const own = { checkin: null as HintCheckin | null };
  const listeners = new Set<() => void>();
  const checkin = {
    hintCheckin: () => Promise.resolve(own.checkin),
    subscribe: (listener: () => void) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
  const generator = createHintGenerator({
    cycle,
    checkin,
    hints,
    profiles,
    library: options.library ?? (() => loadContent()),
  });
  const stored = () => hints.range("2000-01-01", "2100-01-01");
  const nextChange = (count = 1) =>
    new Promise<void>((resolve) => {
      let seen = 0;
      const stop = hints.subscribe(() => {
        seen += 1;
        if (seen < count) return;
        stop();
        resolve();
      });
    });
  const recordIds = async () =>
    (await database.list(HINTS)).map(({ id }) => id).sort();
  return {
    database,
    time,
    cycle,
    hints,
    profiles,
    own,
    listeners,
    checkin,
    generator,
    stored,
    nextChange,
    recordIds,
  };
}

const start = (cycle: ReturnType<typeof setup>["cycle"], date: string) =>
  cycle.savePeriod({ id: "p1", startDate: date, endDate: null });

const entry = (date: string, energy: number) => ({
  date,
  energy,
  mood: 3,
  tension: 3,
  tags: [],
});

describe("conditions (criterion 1)", () => {
  it("makes no hints without a profile, with the panel off or without a start", async () => {
    const s = setup();
    await s.generator.refresh();
    await s.profiles.save({ ...profile, cycle: "no" });
    await start(s.cycle, "2026-11-01");
    await s.generator.refresh();
    expect(await s.stored()).toEqual([]);
  });

  it("keeps the existing hints when the conditions do not hold", async () => {
    const s = setup();
    await s.profiles.save(profile);
    await start(s.cycle, "2026-11-01");
    await s.generator.refresh();
    const before = await s.stored();
    await s.profiles.save({ ...profile, cycle: "no" });
    await s.generator.refresh();
    expect(await s.stored()).toEqual(before);
  });
});

describe("scope and replacement (criteria 2-4)", () => {
  it("makes one hint for today and each of the next two days", async () => {
    const s = setup();
    await s.profiles.save(profile);
    await start(s.cycle, "2026-11-01");
    await s.generator.refresh();
    const hints = await s.stored();
    expect(hints.map((h) => h.forDate)).toEqual([
      "2026-11-08",
      "2026-11-09",
      "2026-11-10",
    ]);
    expect(hints.map((h) => h.contentVersion)).toEqual([3, 3, 3]);
  });

  it("does not change an unchanged result, nor tell anybody", async () => {
    const s = setup();
    await s.profiles.save(profile);
    await start(s.cycle, "2026-11-01");
    await s.generator.refresh();
    const before = await s.database.list(HINTS);
    let changes = 0;
    s.hints.subscribe(() => (changes += 1));
    await s.generator.refresh();
    expect(changes).toBe(0);
    expect(await s.database.list(HINTS)).toEqual(before);
  });

  it("counts a refresh during a run once (no double hints)", async () => {
    const s = setup();
    await s.profiles.save(profile);
    await start(s.cycle, "2026-11-01");
    let changes = 0;
    s.hints.subscribe(() => (changes += 1));
    await Promise.all([
      s.generator.refresh(),
      s.generator.refresh(),
      s.generator.refresh(),
    ]);
    expect(changes).toBe(3);
    expect((await s.recordIds()).length).toBe(3);
  });

  it("an entry of today changes tomorrow and the day after, not today (FR-CYC-08)", async () => {
    const s = setup();
    await s.profiles.save(profile);
    await start(s.cycle, "2026-11-01");
    await s.generator.refresh();
    const [today, ...future] = await s.stored();
    const ids = await s.recordIds();
    await s.cycle.saveWellbeing(entry("2026-11-08", 1));
    await s.generator.refresh();
    const [todayAfter, ...futureAfter] = await s.stored();
    expect(todayAfter).toEqual(today);
    expect(futureAfter).toHaveLength(2);
    for (const hint of futureAfter) {
      expect(["relief", "space"]).toContain(hint.category);
    }
    expect(futureAfter).not.toEqual(future);
    expect(await s.recordIds()).toEqual(ids);
  });
});

describe("own check-in (criterion 6, FR-CHK-08)", () => {
  it("makes the future hints relief or space and reacts to the check-in", async () => {
    const s = setup();
    await s.profiles.save(profile);
    await start(s.cycle, "2026-11-01");
    const stop = s.generator.start([s.checkin]);
    await s.nextChange();
    await s.generator.refresh();
    s.own.checkin = { date: "2026-11-02", answers: scoreOf(1) };
    const changed = s.nextChange(2);
    for (const listener of s.listeners) listener();
    await changed;
    const [, ...future] = await s.stored();
    for (const hint of future) {
      expect(["relief", "space"]).toContain(hint.category);
    }
    stop();
    expect(s.listeners.size).toBe(0);
  });
});

describe("history (criteria 7-8)", () => {
  it("does not repeat a template within 7 days over 10 days, with library texts only", async () => {
    const s = setup();
    await s.profiles.save(profile);
    await start(s.cycle, "2026-11-01");
    for (let day = 0; day < 10; day += 1) {
      s.time.nowMs = new Date(2026, 10, 8 + day, 12).getTime();
      await s.generator.refresh();
    }
    const hints = await s.stored();
    expect(hints).toHaveLength(12);
    // Criterion 9: the texts are those of the library, without forbidden phrases.
    const lists = parseForbiddenLists(forbidden);
    const stems = [...lists.revealing, ...lists.sexual];
    const texts = (loadContent()?.hintTemplates.entries ?? []).map(
      (t) => t.text.feminine,
    );
    for (const { text } of hints) {
      expect(texts).toContain(text);
      expect(findPhrases(text, stems)).toEqual([]);
    }
    for (const a of hints) {
      for (const b of hints) {
        const near =
          a !== b &&
          Math.abs(Date.parse(a.forDate) - Date.parse(b.forDate)) <
            7 * 86_400_000;
        if (near) expect(a.templateId).not.toBe(b.templateId);
      }
    }
  });

  it("removes hints older than 14 days, without a tombstone", async () => {
    const s = setup();
    await s.profiles.save(profile);
    await start(s.cycle, "2026-11-01");
    const put = (date: string) =>
      s.hints.put({
        templateId: "x",
        contentVersion: 1,
        category: "relief",
        date,
        text: "t",
      });
    await put(addDays("2026-11-08", -15));
    await put(addDays("2026-11-08", -14));
    await s.generator.refresh();
    const dates = (await s.stored()).map((h) => h.forDate);
    expect(dates).not.toContain("2026-10-24");
    expect(dates).toContain("2026-10-25");
    expect((await s.recordIds()).length).toBe(4);
  });
});

describe("broken library and failures (criterion 10)", () => {
  it("makes no hints and does not throw", async () => {
    const s = setup({ library: () => loadContent({}) });
    await s.profiles.save(profile);
    await start(s.cycle, "2026-11-01");
    await expect(s.generator.refresh()).resolves.toBeUndefined();
    expect(await s.stored()).toEqual([]);
  });

  it("makes no hints while today is before the first saved start", async () => {
    const s = setup();
    await s.profiles.save(profile);
    await start(s.cycle, "2026-11-08");
    s.time.nowMs = new Date(2026, 10, 1, 12).getTime();
    await s.generator.refresh();
    expect(await s.stored()).toEqual([]);
  });

  it("does not let a failed refresh from a subscription reject unhandled", async () => {
    const s = setup();
    await s.profiles.save(profile);
    const failing = new Error("db");
    s.cycle.periods = () => Promise.reject(failing);
    const stop = s.generator.start([]);
    await expect(s.generator.refresh()).rejects.toBe(failing);
    stop();
  });
});
