import { describe, expect, it } from "vitest";
import { createMemoryDatabase } from "../memory-database";
import { migrations, runMigrations, type Migration } from "./index";

function memoryVersion(start = 0) {
  let version = start;
  return {
    get: () => Promise.resolve(version),
    set: (next: number) => {
      version = next;
      return Promise.resolve();
    },
  };
}

function recording(versions: number[], log: number[]): Migration[] {
  return versions.map((version) => ({
    version,
    run: () => {
      log.push(version);
      return Promise.resolve();
    },
  }));
}

describe("migrations", () => {
  it("starts with an initial migration numbered 1", () => {
    expect(migrations.map((m) => m.version)).toEqual([1]);
  });

  it("runs the migrations in order of their numbers", async () => {
    const log: number[] = [];
    const schema = memoryVersion();
    const result = await runMigrations(
      createMemoryDatabase(),
      schema,
      recording([3, 1, 2], log),
    );
    expect(log).toEqual([1, 2, 3]);
    expect(result).toBe(3);
    expect(await schema.get()).toBe(3);
  });

  it("does not run them a second time", async () => {
    const log: number[] = [];
    const schema = memoryVersion();
    const list = recording([1, 2], log);
    await runMigrations(createMemoryDatabase(), schema, list);
    await runMigrations(createMemoryDatabase(), schema, list);
    expect(log).toEqual([1, 2]);
  });

  it("runs only the migrations newer than the stored version", async () => {
    const log: number[] = [];
    await runMigrations(
      createMemoryDatabase(),
      memoryVersion(1),
      recording([1, 2], log),
    );
    expect(log).toEqual([2]);
  });

  it("keeps the version of the last successful migration on failure", async () => {
    const schema = memoryVersion();
    const list: Migration[] = [
      { version: 1, run: () => Promise.resolve() },
      { version: 2, run: () => Promise.reject(new Error("boom")) },
    ];
    await expect(
      runMigrations(createMemoryDatabase(), schema, list),
    ).rejects.toThrow("boom");
    expect(await schema.get()).toBe(1);
  });
});
