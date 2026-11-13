import { DEFAULT_CHECKIN_SCHEDULE } from "@parapka/domain";
import { expect, it, vi } from "vitest";

import { createMemoryDatabase } from "../data/memory-database";
import { createWithdrawalHandler } from "./withdrawal";

const hlc = "000000000000005-00000-partner";

function setup(shared = true) {
  const database = createMemoryDatabase();
  const deps = {
    database,
    clock: { nowMs: () => new Date("2026-11-12T12:00").getTime() },
    schedule: { get: () => Promise.resolve({ ...DEFAULT_CHECKIN_SCHEDULE }) },
    consent: { isShared: () => Promise.resolve(shared) },
    sealed: { forgetReceived: vi.fn(), resendWeek: vi.fn() },
    keys: { forgetReceived: vi.fn(), resendWeek: vi.fn() },
    reveal: { forgetReceived: vi.fn(), settle: vi.fn() },
  };
  return { deps, handler: createWithdrawalHandler(deps) };
}

it("ignores a command that is not an upsert", async () => {
  const { deps, handler } = setup();
  await handler.apply({
    entity: "CheckInWithdrawal",
    id: "checkin",
    op: "delete",
    hlc,
  });
  expect(deps.sealed.forgetReceived).not.toHaveBeenCalled();
});

it("removes what the partner sent up to the HLC of the command", async () => {
  const { deps, handler } = setup();
  await handler.apply({
    entity: "CheckInWithdrawal",
    id: "checkin",
    op: "upsert",
    fields: { withdrawn: { value: true, hlc } },
  });
  expect(deps.sealed.forgetReceived).toHaveBeenCalledWith(hlc);
  expect(deps.keys.forgetReceived).toHaveBeenCalledWith(hlc);
  expect(deps.reveal.forgetReceived).toHaveBeenCalled();
  expect(deps.reveal.settle).toHaveBeenCalled();
});

it("forgets the marker when the pair ends, so a new pair gets no command", async () => {
  const { deps, handler } = setup();
  await handler.collect(() => hlc);
  await handler.forgetReceived?.();
  const off = createWithdrawalHandler({
    ...deps,
    consent: { isShared: () => Promise.resolve(false) },
  });
  expect(await off.collect(() => hlc)).toEqual([]);
});

it("does nothing in committed when no command was collected", async () => {
  const { deps, handler } = setup();
  await handler.committed?.();
  expect(deps.sealed.resendWeek).not.toHaveBeenCalled();
});

it("sends the open week anew after the command is saved", async () => {
  const { deps, handler } = setup();
  await handler.collect(() => hlc);
  const off = createWithdrawalHandler({
    ...deps,
    consent: { isShared: () => Promise.resolve(false) },
  });
  expect(await off.collect(() => hlc)).toHaveLength(1);
  await off.committed?.();
  expect(deps.sealed.resendWeek).toHaveBeenCalledWith(
    expect.stringMatching(/^\d{4}-W\d{2}$/),
  );
  expect(deps.keys.resendWeek).toHaveBeenCalledWith(
    expect.stringMatching(/^\d{4}-W\d{2}$/),
  );
});
