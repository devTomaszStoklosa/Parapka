import { describe, expect, it } from "vitest";
import type { KeyStore } from "./key-store";

/** Registers the contract tests every KeyStore implementation must pass. */
export function describeKeyStoreContract(
  name: string,
  create: () => KeyStore | Promise<KeyStore>,
): void {
  describe(`KeyStore contract: ${name}`, () => {
    registerReadWriteTests(create);
    registerRemovalTests(create);
  });
}

type Create = () => KeyStore | Promise<KeyStore>;

function registerReadWriteTests(create: Create): void {
  it("returns null for an unknown name", async () => {
    const store = await create();
    expect(await store.get("missing")).toBeNull();
  });

  it("returns the bytes that were set", async () => {
    const store = await create();
    await store.set("a", Uint8Array.of(1, 2, 3));
    expect(await store.get("a")).toEqual(Uint8Array.of(1, 2, 3));
  });

  it("overwrites an existing name", async () => {
    const store = await create();
    await store.set("a", Uint8Array.of(1));
    await store.set("a", Uint8Array.of(2));
    expect(await store.get("a")).toEqual(Uint8Array.of(2));
  });

  it("keeps names apart", async () => {
    const store = await create();
    await store.set("a", Uint8Array.of(1));
    await store.set("b", Uint8Array.of(2));
    expect(await store.get("a")).toEqual(Uint8Array.of(1));
    expect(await store.get("b")).toEqual(Uint8Array.of(2));
  });

  it("is not affected by later changes of the input", async () => {
    const store = await create();
    const bytes = Uint8Array.of(1, 2);
    await store.set("a", bytes);
    bytes[0] = 9;
    expect(await store.get("a")).toEqual(Uint8Array.of(1, 2));
  });
}

function registerRemovalTests(create: Create): void {
  it("deletes one name only", async () => {
    const store = await create();
    await store.set("a", Uint8Array.of(1));
    await store.set("b", Uint8Array.of(2));
    await store.delete("a");
    expect(await store.get("a")).toBeNull();
    expect(await store.get("b")).toEqual(Uint8Array.of(2));
  });

  it("accepts deleting an unknown name", async () => {
    const store = await create();
    await store.delete("missing");
    expect(await store.get("missing")).toBeNull();
  });

  it("clears all names", async () => {
    const store = await create();
    await store.set("a", Uint8Array.of(1));
    await store.set("b", Uint8Array.of(2));
    await store.clear();
    expect(await store.get("a")).toBeNull();
    expect(await store.get("b")).toBeNull();
  });
}
