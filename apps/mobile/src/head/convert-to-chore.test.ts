import { describe, expect, it } from "vitest";

import { localDate } from "../chores/planner-model";
import { exchange, setupConversionPair } from "./head-test-support";
import { createSingleConversion } from "./head-test-support";

describe("turning a thing into a chore", () => {
  it("makes a linked chore that the partner gets too (FR-MNT-08)", async () => {
    const pair = await setupConversionPair();
    const item = await pair.ua.head.add({
      title: "Zapisać do dentysty",
      dueDate: "2026-12-24",
    });
    const chore = await pair.ua.convert(item.id);
    expect(chore).toMatchObject({
      title: "Zapisać do dentysty",
      rule: { kind: "occasional", dueDate: "2026-12-24" },
      assignment: { kind: "person", person: "me" },
      linkedItemId: item.id,
      shared: true,
    });
    expect(await pair.ua.items.list()).toMatchObject([
      { id: item.id, status: "open", linkedChoreId: chore.id },
    ]);
    await exchange(pair);
    expect(await pair.ub.chores.list()).toMatchObject([
      {
        id: chore.id,
        title: "Zapisać do dentysty",
        assignment: { kind: "person", person: "partner" },
        linkedItemId: item.id,
        shared: true,
      },
    ]);
    expect(await pair.ub.items.list()).toMatchObject([
      { id: item.id, linkedChoreId: chore.id },
    ]);
  });

  it("keeps a private thing and its chore on the device", async () => {
    const pair = await setupConversionPair();
    const item = await pair.ua.head.add(
      { title: "Prywatna" },
      { private: true },
    );
    const chore = await pair.ua.convert(item.id);
    expect(chore).toMatchObject({ shared: false, linkedItemId: item.id });
    await exchange(pair);
    expect(await pair.ub.chores.list()).toEqual([]);
    expect(await pair.ub.items.list()).toEqual([]);
  });

  it("works without a pair", async () => {
    const solo = createSingleConversion();
    const item = await solo.head.add({ title: "Sama" });
    const chore = await solo.convert(item.id);
    expect(chore).toMatchObject({
      shared: false,
      assignment: { kind: "person", person: "me" },
      linkedItemId: item.id,
    });
    expect(await solo.items.list()).toMatchObject([
      { linkedChoreId: chore.id },
    ]);
  });

  it("uses today's local date when the thing has no due date", async () => {
    const solo = createSingleConversion();
    const item = await solo.head.add({ title: "Bez terminu" });
    const chore = await solo.convert(item.id);
    expect(chore.rule).toEqual({
      kind: "occasional",
      dueDate: localDate(solo.time.now),
    });
  });

  it.each([
    ["partner", { kind: "person", person: "partner" }],
    ["both", { kind: "both" }],
    ["me", { kind: "person", person: "me" }],
  ] as const)(
    "gives a chore of the carrier %s",
    async (carrier, assignment) => {
      const pair = await setupConversionPair();
      const item = await pair.ua.head.add({ title: "Rzecz", carrier });
      expect(await pair.ua.convert(item.id)).toMatchObject({ assignment });
    },
  );

  it("gives the chore to me when the carrier is not known yet", async () => {
    const pair = await setupConversionPair();
    const item = await pair.ua.items.add({ title: "Bez nosiciela" });
    expect(await pair.ua.convert(item.id)).toMatchObject({
      assignment: { kind: "person", person: "me" },
    });
  });

  it("refuses an unknown, a done and an already linked thing", async () => {
    const solo = createSingleConversion();
    await expect(solo.convert("nope")).rejects.toThrow("unknown item");
    const done = await solo.head.add({ title: "Zrobiona" });
    await solo.items.complete(done.id);
    await expect(solo.convert(done.id)).rejects.toThrow("cannot");
    const linked = await solo.head.add({ title: "Powiązana" });
    await solo.convert(linked.id);
    await expect(solo.convert(linked.id)).rejects.toThrow("cannot");
    expect(await solo.chores.list()).toHaveLength(1);
  });

  it("removes the new chore when the link cannot be saved", async () => {
    const solo = createSingleConversion();
    const item = await solo.head.add({ title: "Rzecz" });
    const failing = {
      ...solo.deps,
      items: { edit: () => Promise.reject(new Error("boom")) },
    };
    const { convertToChore } = await import("./convert-to-chore");
    await expect(convertToChore(failing, item.id)).rejects.toThrow("boom");
    expect(await solo.chores.list()).toEqual([]);
    expect(await solo.items.list()).toMatchObject([{ linkedChoreId: null }]);
  });
});
