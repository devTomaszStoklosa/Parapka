import { expect, it } from "vitest";
import { createMemoryDatabase } from "../memory-database";
import { migrations, runMigrations, type SchemaVersion } from ".";

function memoryVersion(start = 0): SchemaVersion & { value: number } {
  const state = {
    value: start,
    get: () => Promise.resolve(state.value),
    set: (n: number) => {
      state.value = n;
      return Promise.resolve();
    },
  };
  return state;
}

function recording(count: number, calls: number[]) {
  return Array.from({ length: count }, (_, i) => () => {
    calls.push(i + 1);
    return Promise.resolve();
  });
}

it("runs the migrations in order and stores the number", async () => {
  const calls: number[] = [];
  const version = memoryVersion();
  await runMigrations(createMemoryDatabase(), version, recording(3, calls));
  expect(calls).toEqual([1, 2, 3]);
  expect(version.value).toBe(3);
});

it("does not run them a second time", async () => {
  const calls: number[] = [];
  const version = memoryVersion();
  const db = createMemoryDatabase();
  const list = recording(2, calls);
  await runMigrations(db, version, list);
  await runMigrations(db, version, list);
  expect(calls).toEqual([1, 2]);
});

it("runs only the migrations newer than the stored number", async () => {
  const calls: number[] = [];
  const version = memoryVersion(1);
  await runMigrations(createMemoryDatabase(), version, recording(2, calls));
  expect(calls).toEqual([2]);
  expect(version.value).toBe(2);
});

it("registers the empty first migration", async () => {
  const version = memoryVersion();
  await runMigrations(createMemoryDatabase(), version);
  expect(migrations.length).toBeGreaterThanOrEqual(1);
  expect(version.value).toBe(migrations.length);
});
