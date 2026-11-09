// @vitest-environment jsdom
import "fake-indexeddb/auto";
import { beforeEach } from "vitest";
import { createIndexedDbKeyStore } from "./indexeddb-key-store";
import { describeKeyStoreContract } from "./key-store.contract";

beforeEach(async () => {
  await createIndexedDbKeyStore().clear();
});

describeKeyStoreContract("IndexedDB", createIndexedDbKeyStore);
