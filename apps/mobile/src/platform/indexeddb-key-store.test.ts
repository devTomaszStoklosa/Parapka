// @vitest-environment jsdom
import "fake-indexeddb/auto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createIndexedDbKeyStore } from "./indexeddb-key-store";
import { describeKeyStoreContract } from "./key-store.contract";

beforeEach(async () => {
  await createIndexedDbKeyStore().clear();
});

describeKeyStoreContract("IndexedDB", createIndexedDbKeyStore);

describe("IndexedDB failures", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("rejects when the database cannot be opened", async () => {
    const req: IDBOpenDBRequest = {} as IDBOpenDBRequest;
    vi.spyOn(indexedDB, "open").mockImplementation(() => {
      queueMicrotask(() => {
        req.onerror?.(new Event("error"));
      });
      return req;
    });
    await expect(createIndexedDbKeyStore().get("k")).rejects.toThrow(Error);
  });
});
