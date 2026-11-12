import type { ContentChange } from "@parapka/protocol";
import { createHlc, formatHlc } from "@parapka/sync";
import { describe, expect, it } from "vitest";

import { ChoreDeviceError } from "../chores/chore-codec";
import { createMemoryDatabase } from "../data/memory-database";
import { createHandoverRepository } from "./handover-repository";

const AT = formatHlc(createHlc(1_800_000_000_000, 0, "device-b"));

function setup(deviceId: string | null = "device-a") {
  const handovers = createHandoverRepository({
    database: createMemoryDatabase(),
    identity: { deviceId: () => Promise.resolve(deviceId) },
    clock: { nowMs: () => 1_800_000_000_000 },
  });
  return { handovers };
}

const request = {
  requestId: "req-1",
  itemId: "item-1",
  requestedBy: "device-a",
  status: "pending" as const,
  shared: true,
};

const entry = (changedAt: string) => ({
  requestId: "req-1",
  itemId: "item-1",
  requestedBy: "device-b",
  status: "pending",
  changedAt,
});

const upsert = (id: string, values: Record<string, unknown>) =>
  ({
    entity: "HandoverRequest",
    id,
    op: "upsert",
    fields: Object.fromEntries(
      Object.entries(values).map(([name, value]) => [name, { value, hlc: AT }]),
    ),
  }) as ContentChange;

describe("handover repository", () => {
  it("adds an entry with the HLC of the moment", async () => {
    const { handovers } = setup();
    await handovers.append(request);
    await handovers.append({ ...request, requestId: "req-0" });
    const list = await handovers.list();
    expect(list.map((e) => e.requestId)).toEqual(["req-0", "req-1"]);
    expect(list[1]).toMatchObject({
      status: "pending",
      requestedBy: "device-a",
    });
    expect(list[1]?.changedAt).toContain("device-a");
  });

  it("refuses an invalid request", async () => {
    const { handovers } = setup();
    for (const change of [
      { requestId: "" },
      { itemId: "" },
      { requestedBy: "" },
      { status: "other" as "pending" },
    ]) {
      await expect(
        handovers.append({ ...request, ...change }),
      ).rejects.toThrow();
    }
  });

  it("needs the device of this phone", async () => {
    const { handovers } = setup(null);
    await expect(handovers.append(request)).rejects.toThrow(ChoreDeviceError);
  });

  it("moves an entry into the state once it was sent", async () => {
    const { handovers } = setup();
    await handovers.append(request);
    const sent = await handovers.sync.collect(() => AT);
    expect(sent).toHaveLength(1);
    await handovers.sync.commit(sent);
    expect(await handovers.sync.collect(() => AT)).toEqual([]);
    expect(await handovers.list()).toHaveLength(1);
  });

  it("takes in an entry of the partner", async () => {
    const { handovers } = setup();
    await handovers.sync.merge(upsert(`req-1|${AT}`, entry(AT)));
    expect(await handovers.list()).toEqual([entry(AT)]);
  });

  it("skips what is not a whole, valid entry", async () => {
    const { handovers } = setup();
    const id = `req-1|${AT}`;
    await handovers.sync.merge(upsert(id, entry("not an HLC")));
    await handovers.sync.merge(upsert(id, { ...entry(AT), status: "gone" }));
    await handovers.sync.merge(upsert(id, { requestId: "req-1" }));
    await handovers.sync.merge(upsert("other-id", entry(AT)));
    await handovers.sync.merge({
      entity: "HandoverRequest",
      id,
      op: "delete",
      hlc: AT,
    });
    expect(await handovers.list()).toEqual([]);
  });

  it("does not overwrite an entry that is private here", async () => {
    const { handovers } = setup();
    await handovers.append(request);
    await handovers.sync.makePrivate();
    expect(await handovers.sync.collect(() => AT)).toEqual([]);
    const changedAt = (await handovers.list())[0]?.changedAt ?? "";
    await handovers.sync.merge(
      upsert(`req-1|${changedAt}`, { ...entry(changedAt), itemId: "x" }),
    );
    expect(await handovers.list()).toMatchObject([{ itemId: "item-1" }]);
  });
});
