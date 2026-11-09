import { afterEach, expect, it, vi } from "vitest";
import { systemClock } from "./clock";

afterEach(() => {
  vi.restoreAllMocks();
});

it("reads Date.now()", () => {
  vi.spyOn(Date, "now").mockReturnValue(1_700_000_000_123);
  expect(systemClock.nowMs()).toBe(1_700_000_000_123);
});
