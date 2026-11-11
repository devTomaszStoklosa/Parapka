import { formatHlc } from "@parapka/sync";
import { expect, it, vi } from "vitest";

import { createMemoryDatabase } from "../data/memory-database";
import { createPartnerProfileRepository } from "./partner-profile-repository";

const h = (physical: number) =>
  formatHlc({
    physical: 1_800_000_000_000 + physical,
    counter: 0,
    deviceId: "device-a",
  });

it("is empty before anything arrives", async () => {
  const repo = createPartnerProfileRepository(createMemoryDatabase());
  expect(await repo.get()).toBeNull();
});

it("stores the newest valid values and ignores the rest", async () => {
  const repo = createPartnerProfileRepository(createMemoryDatabase());
  await repo.merge({
    name: { value: "Ola", hlc: h(2) },
    form: { value: "feminine", hlc: h(2) },
    goals: { value: ["chores"], hlc: h(2) },
    extra: { value: "x", hlc: h(2) },
  });
  await repo.merge({
    name: { value: "Old", hlc: h(1) },
    form: { value: "robot", hlc: h(3) },
    goals: { value: ["nope"], hlc: h(3) },
  });
  expect(await repo.get()).toEqual({
    name: "Ola",
    form: "feminine",
    goals: ["chores"],
  });
  await repo.merge({ name: { value: "Ola K", hlc: h(4) } });
  expect((await repo.get())?.name).toBe("Ola K");
});

it("needs both the name and the form", async () => {
  const repo = createPartnerProfileRepository(createMemoryDatabase());
  await repo.merge({ name: { value: "Ola", hlc: h(1) } });
  expect(await repo.get()).toBeNull();
});

it("notifies a subscriber of another instance on the same database", async () => {
  const db = createMemoryDatabase();
  const listener = vi.fn();
  createPartnerProfileRepository(db).subscribe(listener);
  await createPartnerProfileRepository(db).merge({
    name: { value: "Ola", hlc: h(1) },
  });
  expect(listener).toHaveBeenCalledTimes(1);
});

it("notifies the listeners after a write until they unsubscribe", async () => {
  const repo = createPartnerProfileRepository(createMemoryDatabase());
  const listener = vi.fn();
  const unsubscribe = repo.subscribe(listener);
  await repo.merge({ name: { value: "Ola", hlc: h(1) } });
  expect(listener).toHaveBeenCalledTimes(1);
  unsubscribe();
  await repo.merge({ name: { value: "Ola K", hlc: h(2) } });
  expect(listener).toHaveBeenCalledTimes(1);
});

it("takes a null as the withdrawal of the goals, and only of them", async () => {
  const repo = createPartnerProfileRepository(createMemoryDatabase());
  await repo.merge({
    name: { value: "Ola", hlc: h(1) },
    form: { value: "feminine", hlc: h(1) },
    goals: { value: ["chores"], hlc: h(1) },
  });
  await repo.merge({
    name: { value: null, hlc: h(2) },
    goals: { value: null, hlc: h(2) },
    otherGoalText: { value: null, hlc: h(2) },
  });
  expect(await repo.get()).toEqual({
    name: "Ola",
    form: "feminine",
    goals: null,
  });
  await repo.merge({ otherGoalText: { value: "text", hlc: h(3) } });
  await repo.merge({ goals: { value: ["chores"], hlc: h(1) } });
  expect((await repo.get())?.goals).toBeNull();
});
