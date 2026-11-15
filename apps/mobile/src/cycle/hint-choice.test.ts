import { createUuid7Generator } from "@parapka/domain";
import { describe, expect, it } from "vitest";

import { createMemoryDatabase } from "../data/memory-database";
import { createProfileRepository } from "../data/profile-repository";
import { profile } from "../sync/wiring-test-support";
import { loadContent } from "./content";
import { createCycleRepository } from "./cycle-repository";
import { createCycleService } from "./cycle-service";
import { createHintChoice } from "./hint-choice";
import { createHintGenerator } from "./hint-generator";
import { addDays, createHintRepository } from "./hint-repository";
import { createWellbeingRepository } from "./wellbeing-repository";

const TODAY = "2026-11-08";

async function setup(withProfile = true) {
  const database = createMemoryDatabase();
  const clock = { nowMs: () => new Date(2026, 10, 8, 12).getTime() };
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
  if (withProfile) await profiles.save({ ...profile, cycle: "yes" });
  const deps = {
    cycle,
    checkin: { hintCheckin: () => Promise.resolve(null) },
    hints,
    profiles,
    library: () => loadContent(),
  };
  const generator = createHintGenerator(deps);
  const choice = createHintChoice(deps);
  const stored = () => hints.range("2000-01-01", "2100-01-01");
  const begin = async () => {
    await cycle.savePeriod({
      id: "p1",
      startDate: "2026-11-01",
      endDate: null,
    });
    await generator.refresh();
  };
  return { deps, hints, generator, choice, stored, begin, profiles };
}

describe("candidates", () => {
  it("gives the current hint first, then others, the same every time", async () => {
    const s = await setup();
    await s.begin();
    const current = await s.hints.forDate(TODAY);
    const found = await s.choice.candidates(TODAY);
    expect(found).toHaveLength(3);
    expect(found[0]).toMatchObject({
      templateId: current?.templateId,
      text: current?.text,
      date: TODAY,
    });
    expect(new Set(found.map((hint) => hint.templateId)).size).toBe(3);
    expect(await s.choice.candidates(TODAY)).toEqual(found);
  });

  it("gives none for another day, without a hint or without a profile", async () => {
    const s = await setup();
    expect(await s.choice.candidates(TODAY)).toEqual([]);
    await s.begin();
    expect(await s.choice.candidates(addDays(TODAY, 1))).toEqual([]);
    const bare = await setup(false);
    await bare.begin();
    expect(await bare.choice.candidates(TODAY)).toEqual([]);
  });

  it("gives only the current hint when the day has no phase", async () => {
    const s = await setup();
    await s.hints.put({
      templateId: "x",
      contentVersion: 1,
      category: "space",
      date: TODAY,
      text: "Ręczna",
    });
    expect((await s.choice.candidates(TODAY)).map((h) => h.text)).toEqual([
      "Ręczna",
    ]);
  });

  it("gives fewer when the engine has nothing more", async () => {
    const s = await setup();
    const library = loadContent();
    const entries = library?.hintTemplates.entries.slice(0, 1) ?? [];
    const few = createHintChoice({
      ...s.deps,
      library: () =>
        library && {
          ...library,
          hintTemplates: { ...library.hintTemplates, entries },
        },
    });
    await s.begin();
    expect((await few.candidates(TODAY)).length).toBeLessThan(3);
  });
});

describe("choose", () => {
  it("replaces the hint of today in the same record and keeps it on refresh", async () => {
    const s = await setup();
    await s.begin();
    const before = await s.stored();
    const [, second] = await s.choice.candidates(TODAY);
    expect(await s.choice.choose(TODAY, second?.templateId ?? "")).toBe(true);
    const after = await s.stored();
    expect(after[0]).toMatchObject({
      text: second?.text,
      category: second?.category,
      templateId: second?.templateId,
      status: "scheduled",
    });
    expect(after.slice(1)).toEqual(before.slice(1));
    await s.generator.refresh();
    expect(await s.stored()).toEqual(after);
  });

  it("refuses a template that is not a candidate, or another day", async () => {
    const s = await setup();
    await s.begin();
    const before = await s.stored();
    expect(await s.choice.choose(TODAY, "nope")).toBe(false);
    const [, second] = await s.choice.candidates(TODAY);
    expect(await s.choice.choose("2026-11-09", second?.templateId ?? "")).toBe(
      false,
    );
    expect(await s.stored()).toEqual(before);
  });

  it("brings back a skipped hint and keeps a chosen one scheduled", async () => {
    const s = await setup();
    await s.begin();
    await s.choice.skip(TODAY);
    const [, second] = await s.choice.candidates(TODAY);
    expect(await s.choice.choose(TODAY, second?.templateId ?? "")).toBe(true);
    expect((await s.hints.forDate(TODAY))?.status).toBe("scheduled");
    const [first] = await s.choice.candidates(TODAY);
    await s.choice.choose(TODAY, first?.templateId ?? "");
    expect((await s.hints.forDate(TODAY))?.templateId).toBe(first?.templateId);
  });
});

describe("skip and restore", () => {
  it("sets the status of today only, and refresh keeps it", async () => {
    const s = await setup();
    await s.begin();
    const before = await s.stored();
    expect(await s.choice.skip(TODAY)).toBe(true);
    const skipped = await s.stored();
    expect(skipped.map((hint) => hint.status)).toEqual([
      "skipped",
      "scheduled",
      "scheduled",
    ]);
    expect(skipped[0]).toMatchObject({ text: before[0]?.text });
    await s.generator.refresh();
    expect(await s.stored()).toEqual(skipped);
    expect(await s.choice.restore(TODAY)).toBe(true);
    expect(await s.stored()).toEqual(before);
  });

  it("leaves other days alone", async () => {
    const s = await setup();
    await s.begin();
    const before = await s.stored();
    for (const day of [addDays(TODAY, 1), addDays(TODAY, -1)]) {
      expect(await s.choice.skip(day)).toBe(false);
      expect(await s.choice.restore(day)).toBe(false);
    }
    expect(await s.stored()).toEqual(before);
  });
});
