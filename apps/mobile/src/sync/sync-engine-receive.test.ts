import type { Envelope } from "@parapka/protocol";
import { describe, expect, it } from "vitest";

import { createPairedDevices, sendRaw } from "./sync-test-support";

const STAMP = "000000000000001-00000-device-a";

function content(...changes: unknown[]): string {
  return JSON.stringify({ schemaVersion: 1, changes });
}

const choreDelete = { entity: "Chore", id: "c1", op: "delete", hlc: STAMP };

describe("SyncEngine receive", () => {
  it("applies a change once however often the envelope arrives", async () => {
    const devices = await createPairedDevices();
    await sendRaw(devices, "e1", content(choreDelete));
    await sendRaw(devices, "e1", content(choreDelete));
    await devices.b.engine.pull();
    await devices.b.engine.pull();
    expect(devices.b.handler.applied).toBe(1);
    expect(await devices.b.engine.errors()).toEqual([]);
  });

  it("rejects an envelope with a wrong key and logs it without the content", async () => {
    const devices = await createPairedDevices();
    const wrongKey = devices.sodium.randomBytes(32);
    await sendRaw(devices, "e1", content(choreDelete), wrongKey);
    await devices.b.engine.pull();

    expect(devices.b.handler.applied).toBe(0);
    const errors = await devices.b.engine.errors();
    expect(errors).toHaveLength(1);
    expect(errors[0]).toMatchObject({
      reason: "decrypt-failed",
      envelopeId: "e1",
    });
    expect(JSON.stringify(errors)).not.toContain("Chore");
    expect((await devices.b.pairs.current())?.deviceId).toBeNull();
  });

  it("rejects an envelope that is not valid", async () => {
    const devices = await createPairedDevices();
    const broken = { envelopeId: "e1", senderDeviceId: "device-a" };
    await devices.a.transport.send(broken as unknown as Envelope);
    await devices.b.engine.pull();
    expect(await devices.b.engine.errors()).toMatchObject([
      { reason: "invalid-envelope", envelopeId: null },
    ]);
  });

  it.each([
    ["text", "not json"],
    ["shape", JSON.stringify({ schemaVersion: 1 })],
    ["timestamp", content({ ...choreDelete, hlc: "bad" })],
  ])("rejects content with a bad %s", async (_name, text) => {
    const devices = await createPairedDevices();
    await sendRaw(devices, "e1", text);
    await devices.b.engine.pull();
    expect(await devices.b.engine.errors()).toMatchObject([
      { reason: "invalid-content", envelopeId: "e1" },
    ]);
    expect(devices.b.handler.applied).toBe(0);
  });

  it("keeps content of a newer schema and marks it as needing an update", async () => {
    const devices = await createPairedDevices();
    const future = { schemaVersion: 99, changes: [], extra: "kept" };
    await sendRaw(devices, "e1", JSON.stringify(future));
    await devices.b.engine.pull();
    await sendRaw(devices, "e1", JSON.stringify(future));
    await devices.b.engine.pull();

    expect(await devices.b.engine.held()).toEqual([
      { envelopeId: "e1", kind: "needs-update", content: future },
    ]);
    expect(await devices.b.engine.errors()).toEqual([]);
    expect(devices.b.handler.applied).toBe(0);
  });

  it("keeps changes of an unknown entity and applies the rest", async () => {
    const devices = await createPairedDevices();
    const mystery = { ...choreDelete, entity: "Mystery", id: "m1" };
    await sendRaw(devices, "e1", content(mystery, choreDelete));
    await devices.b.engine.pull();

    expect(await devices.b.engine.held()).toEqual([
      { envelopeId: "e1", kind: "unknown-entity", content: mystery },
    ]);
    expect(devices.b.handler.applied).toBe(1);
  });

  it("learns the device id of the partner from the first readable envelope", async () => {
    const devices = await createPairedDevices();
    expect((await devices.b.pairs.current())?.deviceId).toBeNull();
    await sendRaw(devices, "e1", content(choreDelete));
    await sendRaw(devices, "e2", content(choreDelete));
    await devices.b.engine.pull();
    expect(await devices.b.pairs.current()).toMatchObject({
      deviceId: "device-a",
      state: "confirmed",
    });
  });

  it("stamps a local edit after a restart above a stamp received before it", async () => {
    const devices = await createPairedDevices();
    const ahead = "001900000000000-00000-device-a";
    await sendRaw(devices, "e1", content({ ...choreDelete, hlc: ahead }));
    await devices.b.engine.pull();

    const engine = devices.b.restart();
    devices.b.handler.edit("c2", "name", "x");
    await engine.push();
    const stamp = (await devices.b.database.get("sync-state", "hlc")) as {
      last: string;
    };
    expect(stamp.last > ahead).toBe(true);
  });
});
