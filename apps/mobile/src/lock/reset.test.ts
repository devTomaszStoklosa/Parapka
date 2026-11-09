import { expect, it } from "vitest";

import { createMemoryDatabase } from "../data/memory-database";
import { createMemoryKeyStore } from "../platform/memory-key-store";
import { resetApp } from "./reset";

it("clears the local database and the key store", async () => {
  const database = createMemoryDatabase();
  const keyStore = createMemoryKeyStore();
  await database.put("profile", "me", { name: "A" });
  await keyStore.set("key", Uint8Array.of(1));
  await resetApp({ database, keyStore });
  expect(await database.get("profile", "me")).toBeNull();
  expect(await keyStore.get("key")).toBeNull();
});
