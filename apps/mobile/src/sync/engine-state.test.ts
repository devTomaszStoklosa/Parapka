import { expect, it } from "vitest";

import { createMemoryDatabase } from "../data/memory-database";
import { clearEngineState } from "./engine-state";

it("clears the cursor and the records of received envelopes, not the queue", async () => {
  const database = createMemoryDatabase();
  await database.put("sync-state", "cursor", { after: "c1" });
  await database.put("sync-state", "hlc", { last: "x" });
  await database.put("sync-applied", "e1", { atMs: 1 });
  await database.put("sync-held", "e2", { kind: "unknown-entity" });
  await database.put("sync-errors", "r1", { reason: "decrypt-failed" });
  await database.put("sync-outbox", "e3", { envelopeId: "e3" });

  await clearEngineState(database);

  expect(await database.get("sync-state", "cursor")).toBeNull();
  expect(await database.list("sync-applied")).toEqual([]);
  expect(await database.list("sync-held")).toEqual([]);
  expect(await database.list("sync-errors")).toEqual([]);
  expect(await database.get("sync-state", "hlc")).not.toBeNull();
  expect(await database.list("sync-outbox")).toHaveLength(1);
});
