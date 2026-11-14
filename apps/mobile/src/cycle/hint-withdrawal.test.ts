import type { ContentChange } from "@parapka/protocol";
import { expect, it, vi } from "vitest";

import { createMemoryDatabase } from "../data/memory-database";
import { createHintWithdrawalHandler } from "./hint-withdrawal";

const DAY = "2026-11-14";
const HLC = "000000000000009-00000-device-a";
const next = () => HLC;

function setup() {
  const database = createMemoryDatabase();
  const flags = { shared: true, paused: false };
  const hints = { resendFrom: vi.fn(() => Promise.resolve()) };
  const received = { forgetSent: vi.fn(() => Promise.resolve()) };
  const handler = createHintWithdrawalHandler({
    database,
    today: () => DAY,
    consent: { isShared: () => Promise.resolve(flags.shared) },
    pause: { isPaused: () => Promise.resolve(flags.paused) },
    hints,
    received,
  });
  const marker = () => database.get("hint-withdrawal", "state");
  /** One round of the engine: collect, save the envelope, `committed`. */
  const round = async () => {
    const changes = await handler.collect(next);
    await handler.committed?.();
    return changes;
  };
  return { database, flags, hints, received, handler, marker, round };
}

const command = (from: string): ContentChange => ({
  entity: "HintWithdrawal",
  id: "hints",
  op: "upsert",
  fields: { from: { value: from, hlc: HLC } },
});

it("is a handler without a category, so the pause and the consent do not stop it", () => {
  const { handler } = setup();
  expect(handler).toMatchObject({
    entity: "HintWithdrawal",
    category: null,
  });
});

it("sends no command while the hints are shared and notes the state", async () => {
  const { round, marker, hints } = setup();
  expect(await round()).toEqual([]);
  expect(await marker()).toBe("shared");
  expect(await round()).toEqual([]);
  expect(hints.resendFrom).not.toHaveBeenCalled();
});

it("sends one command from today on a pause, and one more nothing", async () => {
  const { round, marker, flags } = setup();
  await round();
  flags.paused = true;
  expect(await round()).toEqual([command(DAY)]);
  expect(await marker()).toBe("paused");
  expect(await round()).toEqual([]);
});

it("sends one command for everything when the consent goes off, from shared or from the pause", async () => {
  const first = setup();
  await first.round();
  first.flags.shared = false;
  expect(await first.round()).toEqual([command("all")]);
  expect(await first.marker()).toBe("withdrawn");
  expect(await first.round()).toEqual([]);

  const second = setup();
  await second.round();
  second.flags.paused = true;
  await second.round();
  second.flags.shared = false;
  expect(await second.round()).toEqual([command("all")]);
});

it("sends the hints anew on the resume and when the consent returns", async () => {
  const { round, marker, flags, hints } = setup();
  await round();
  flags.paused = true;
  await round();
  flags.paused = false;
  expect(await round()).toEqual([]);
  expect(hints.resendFrom).toHaveBeenCalledTimes(1);
  expect(hints.resendFrom).toHaveBeenCalledWith(DAY);
  expect(await marker()).toBe("shared");

  flags.shared = false;
  await round();
  flags.shared = true;
  expect(await round()).toEqual([]);
  expect(hints.resendFrom).toHaveBeenCalledTimes(2);
});

it("sends no command when the partner never saw the hints", async () => {
  const { round, marker, flags, hints } = setup();
  flags.shared = false;
  expect(await round()).toEqual([]);
  expect(await marker()).toBe("withdrawn");
  flags.paused = true;
  flags.shared = true;
  expect(await round()).toEqual([]);
  expect(await marker()).toBe("paused");
  flags.paused = false;
  await round();
  expect(hints.resendFrom).toHaveBeenCalledTimes(1);
});

it("moves the marker only when the envelope is saved", async () => {
  const { handler, marker, flags } = setup();
  await handler.collect(next);
  flags.paused = true;
  expect(await handler.collect(next)).toHaveLength(1);
  expect(await marker()).toBe("shared");
  // The save failed: the next collect still has the command.
  expect(await handler.collect(next)).toHaveLength(1);
  await handler.committed?.();
  expect(await marker()).toBe("paused");
  await handler.committed?.();
  expect(await marker()).toBe("paused");
});

it("clears the marker when the pair ends", async () => {
  const { handler, marker, flags, round } = setup();
  await round();
  flags.paused = true;
  await handler.collect(next);
  await handler.forgetReceived?.();
  expect(await marker()).toBeNull();
  await handler.committed?.();
  expect(await marker()).toBeNull();
});

it("removes the hints of the partner up to the command, from the date or all", async () => {
  const { handler, received } = setup();
  await handler.apply(command("2026-11-14"));
  await handler.apply(command("all"));
  expect(received.forgetSent).toHaveBeenNthCalledWith(1, "2026-11-14", HLC);
  expect(received.forgetSent).toHaveBeenNthCalledWith(2, null, HLC);
});

it("skips a command with an invalid scope or a change that is not an upsert", async () => {
  const { handler, received } = setup();
  await handler.apply(command("yesterday"));
  await handler.apply(command(""));
  await handler.apply({
    entity: "HintWithdrawal",
    id: "hints",
    op: "delete",
    hlc: HLC,
  });
  await handler.apply({
    entity: "HintWithdrawal",
    id: "hints",
    op: "upsert",
    fields: {},
  });
  expect(received.forgetSent).not.toHaveBeenCalled();
});
