import { describe, expect, it } from "vitest";

import {
  ME,
  WEEKDAYS,
  createSingleDevice,
  exchange,
  setupChorePair,
} from "./chore-test-support";

const input = { title: "Wynieść śmieci", rule: WEEKDAYS, assignment: ME };

describe("a private chore", () => {
  it("stays on this device in a pair and is not sent to the partner", async () => {
    const pair = await setupChorePair();
    const own = await pair.ca.add(input, { private: true });
    const shared = await pair.ca.add({ ...input, title: "Wspólny" });
    expect(own.shared).toBe(false);
    expect(shared.shared).toBe(true);
    await exchange(pair);
    expect((await pair.ca.list()).map((chore) => chore.title)).toEqual([
      input.title,
      "Wspólny",
    ]);
    expect((await pair.cb.list()).map((chore) => chore.title)).toEqual([
      "Wspólny",
    ]);
  });

  it("is private without a pair, asked for or not", async () => {
    const { chores } = createSingleDevice();
    expect((await chores.add(input)).shared).toBe(false);
    expect((await chores.add(input, { private: false })).shared).toBe(false);
    expect((await chores.add(input, { private: true })).shared).toBe(false);
  });

  it("saves only the fields that were passed on edit", async () => {
    const pair = await setupChorePair();
    const { id } = await pair.ca.add(input);
    await exchange(pair);
    await pair.ca.edit(id, { title: "Nowy tytuł" });
    await pair.cb.edit(id, { rule: { kind: "daily" } });
    await exchange(pair);
    for (const chores of [pair.ca, pair.cb]) {
      expect(await chores.list()).toMatchObject([
        { title: "Nowy tytuł", rule: { kind: "daily" } },
      ]);
    }
  });
});
