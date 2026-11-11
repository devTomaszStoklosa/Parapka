import type { ContentChange } from "@parapka/protocol";
import { createHlc, formatHlc } from "@parapka/sync";
import { describe, expect, it } from "vitest";

import { createPairedDevices } from "../sync/sync-test-support";
import {
  createSingleDevice,
  ME,
  WEEKDAYS,
  withChores,
} from "./chore-test-support";

const input = { title: "Podlać kwiaty", rule: WEEKDAYS, assignment: ME };

const stamp = (physical: number) => formatHlc(createHlc(physical, 0, "x"));

const upsert = (
  id: string,
  fields: Record<string, unknown>,
  physical = 10,
): ContentChange => ({
  entity: "Chore",
  id,
  op: "upsert",
  fields: Object.fromEntries(
    Object.entries(fields).map(([name, value]) => [
      name,
      { value, hlc: stamp(physical) },
    ]),
  ),
});

const valid = {
  title: "Pranie",
  rule: { kind: "daily" },
  assignment: { kind: "anyone" },
};

describe("chore handler", () => {
  it("syncs under SHARED_CHORES", () => {
    const { handler } = createSingleDevice();
    expect(handler).toMatchObject({
      entity: "Chore",
      category: "SHARED_CHORES",
    });
  });

  it("does not collect a private chore", async () => {
    const { chores, handler } = createSingleDevice();
    await chores.add(input);
    expect(await handler.collect(() => stamp(1))).toEqual([]);
  });

  it("collects the pending changes of a shared chore once", async () => {
    const { a } = await createPairedDevices();
    const { chores, handler } = withChores(a);
    const { id } = await chores.add(input);
    await chores.remove(id);
    const changes = await handler.collect(() => stamp(5));
    expect(changes.map((change) => change.op)).toEqual(["upsert", "delete"]);
    await handler.committed?.();
    expect(await handler.collect(() => stamp(6))).toEqual([]);
    expect(await chores.list()).toEqual([]);
  });

  it("keeps an edit that came after the collect", async () => {
    const { a } = await createPairedDevices();
    const { chores, handler } = withChores(a);
    const { id } = await chores.add(input);
    await handler.collect(() => stamp(5));
    await chores.edit(id, { title: "Później" });
    await handler.committed?.();
    const next = await handler.collect(() => stamp(6));
    expect(next).toHaveLength(1);
    expect((await chores.list())[0]?.title).toBe("Później");
  });

  it("takes in a valid chore of the partner", async () => {
    const { chores, handler } = createSingleDevice();
    await handler.apply(upsert("p-1", valid));
    expect(await chores.list()).toEqual([
      { id: "p-1", ...valid, shared: true },
    ]);
  });

  it("skips the fields that are not valid", async () => {
    const { chores, handler } = createSingleDevice();
    const bad: Record<string, unknown>[] = [
      { title: "" },
      { title: 5 },
      { other: "x" },
      { rule: null },
      { rule: { kind: "yearly" } },
      { rule: { kind: "monthly", dayOfMonth: 99 } },
      { assignment: null },
      { assignment: { kind: "robot" } },
      { assignment: { kind: "person" } },
      { assignment: { kind: "alternating", firstDeviceId: "d" } },
      {
        assignment: {
          kind: "alternating",
          firstDeviceId: "d",
          startDate: "nope",
        },
      },
    ];
    for (const fields of bad) await handler.apply(upsert("p-1", fields));
    expect(await chores.list()).toEqual([]);
    // The valid fields are kept; the chore is incomplete without a title.
    await handler.apply(upsert("p-1", { ...valid, title: "" }));
    expect(await chores.list()).toEqual([]);
    await handler.apply(upsert("p-1", { title: "Dobry" }, 20));
    expect((await chores.list())[0]?.title).toBe("Dobry");
  });

  it("does not overwrite a chore that is private here", async () => {
    const { chores, handler } = createSingleDevice();
    const { id } = await chores.add(input);
    await handler.apply(upsert(id, { title: "Obce" }));
    await handler.apply({
      entity: "Chore",
      id,
      op: "delete",
      hlc: stamp(99),
    });
    expect((await chores.list())[0]?.title).toBe(input.title);
  });

  it("keeps a deletion that arrives before the chore", async () => {
    const { chores, handler } = createSingleDevice();
    await handler.apply({
      entity: "Chore",
      id: "p-1",
      op: "delete",
      hlc: stamp(30),
    });
    await handler.apply(upsert("p-1", valid, 10));
    expect(await chores.list()).toEqual([]);
  });

  it("marks the shared chores private when the pair ends", async () => {
    const { a } = await createPairedDevices();
    const { chores, handler } = withChores(a);
    await chores.add(input);
    await handler.apply(upsert("p-1", valid));
    await handler.disconnected?.();
    await handler.disconnected?.();
    const list = await chores.list();
    expect(list.map((chore) => chore.shared)).toEqual([false, false]);
    expect(await handler.collect(() => stamp(7))).toEqual([]);
  });
});

describe("chore handler subscription", () => {
  it("passes on the changes of the chores and of the check-offs", async () => {
    const { a } = await createPairedDevices();
    const { chores, handler, completions, completionHandler } = withChores(a);
    const heard = { chore: 0, completion: 0 };
    const stop = handler.subscribe?.(() => (heard.chore += 1));
    completionHandler.subscribe?.(() => (heard.completion += 1));
    const { id } = await chores.add(input);
    expect(heard).toEqual({ chore: 1, completion: 0 });
    await completions.complete(id, "2026-01-05");
    expect(heard.completion).toBe(1);
    stop?.();
    await chores.remove(id);
    expect(heard.chore).toBe(1);
  });
});
