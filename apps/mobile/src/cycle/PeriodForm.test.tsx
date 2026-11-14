// @vitest-environment jsdom
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { pl } from "../i18n/pl";
import { PlatformProvider } from "../platform/context";
import { cycleOf, setup, useSodium } from "./cycle-screen-test-support";
import { PeriodForm } from "./PeriodForm";
import { PeriodValidationError, type PeriodLog } from "./period-validation";

useSodium();
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const p = pl.cycle.period;
// The clock of the support is 2026-11-11, noon.
const TODAY = "2026-11-11";
const entry = (
  id: string,
  startDate: string,
  endDate: string | null,
): PeriodLog => ({ id, startDate, endDate });

async function open(
  existing: PeriodLog[],
  selected: string | null = null,
  length = 5,
) {
  const { platform } = await setup(false);
  const service = cycleOf(platform);
  for (const period of existing) await service.savePeriod(period);
  const onDone = vi.fn();
  render(
    <PlatformProvider platform={platform}>
      <PeriodForm
        periods={existing}
        periodLength={length}
        today={TODAY}
        selected={selected}
        onDone={onDone}
      />
    </PlatformProvider>,
  );
  return { service, onDone };
}

const press = (name: string) => {
  fireEvent.click(screen.getByRole("button", { name }));
};

describe("today's button", () => {
  it("saves the start of today with one touch", async () => {
    const { service, onDone } = await open([]);
    press(p.startToday);
    await waitFor(() => {
      expect(onDone).toHaveBeenCalled();
    });
    expect(await service.periods()).toEqual([
      expect.objectContaining({ startDate: TODAY, endDate: null }),
    ]);
  });

  it("ends the ongoing period today", async () => {
    const { service, onDone } = await open([entry("a", "2026-11-09", null)]);
    expect(screen.queryByRole("button", { name: p.startToday })).toBeNull();
    press(p.endToday);
    await waitFor(() => {
      expect(onDone).toHaveBeenCalled();
    });
    expect(await service.periods()).toEqual([entry("a", "2026-11-09", TODAY)]);
  });

  it("offers the start again when the old entry was never closed", async () => {
    await open([entry("a", "2026-10-01", null)]);
    expect(screen.getByRole("button", { name: p.startToday })).toBeTruthy();
  });
});

describe("the panel of a day", () => {
  it("sets the start of a period on a day without an entry", async () => {
    const { service, onDone } = await open([], "2026-11-03");
    expect(screen.getByText("Wybrany dzień: 3 listopada")).toBeTruthy();
    press(p.startOnDay);
    await waitFor(() => {
      expect(onDone).toHaveBeenCalled();
    });
    expect(await service.periods()).toEqual([
      expect.objectContaining({ startDate: "2026-11-03" }),
    ]);
  });

  it("ends the ongoing period on a later day", async () => {
    const { service } = await open(
      [entry("a", "2026-11-01", null)],
      "2026-11-07",
    );
    press(p.endOnDay);
    await waitFor(async () => {
      expect(await service.periods()).toEqual([
        entry("a", "2026-11-01", "2026-11-07"),
      ]);
    });
  });

  it("offers no end on a day without an ongoing period", async () => {
    await open([], "2026-11-03");
    expect(screen.queryByRole("button", { name: p.endOnDay })).toBeNull();
  });

  it("moves the start of an entry", async () => {
    const { service } = await open(
      [entry("a", "2026-11-01", "2026-11-05")],
      "2026-11-03",
    );
    press(p.setStart);
    await waitFor(async () => {
      expect(await service.periods()).toEqual([
        entry("a", "2026-11-03", "2026-11-05"),
      ]);
    });
  });

  it("moves the end of an entry", async () => {
    const { service } = await open(
      [entry("a", "2026-11-01", "2026-11-05")],
      "2026-11-03",
    );
    press(p.setEnd);
    await waitFor(async () => {
      expect(await service.periods()).toEqual([
        entry("a", "2026-11-01", "2026-11-03"),
      ]);
    });
  });

  it("closes the panel without a change", async () => {
    const { onDone } = await open([], "2026-11-03");
    press(p.close);
    expect(onDone).toHaveBeenCalled();
  });

  it("deletes an entry only after the confirmation", async () => {
    const { service, onDone } = await open(
      [entry("a", "2026-11-01", "2026-11-05")],
      "2026-11-03",
    );
    press(p.delete);
    expect(screen.getByText(p.confirm.title)).toBeTruthy();
    press(p.confirm.no);
    expect(screen.queryByText(p.confirm.title)).toBeNull();
    expect(await service.periods()).toHaveLength(1);
    press(p.delete);
    press(p.confirm.yes);
    await waitFor(() => {
      expect(onDone).toHaveBeenCalled();
    });
    expect(await service.periods()).toEqual([]);
  });
});

describe("failures", () => {
  it.each([
    ["overlap", p.error.overlap],
    ["future", p.error.future],
    ["order", p.error.order],
    ["length", p.error.length],
    ["date", p.error.generic],
  ] as const)("tells the reason %s", async (reason, text) => {
    const { service, onDone } = await open([]);
    vi.spyOn(service, "savePeriod").mockRejectedValue(
      new PeriodValidationError(reason, "x"),
    );
    press(p.startToday);
    expect((await screen.findByRole("alert")).textContent).toBe(text);
    expect(onDone).not.toHaveBeenCalled();
  });

  it("refuses a day in the future for real", async () => {
    const { service } = await open([], "2026-11-12");
    press(p.startOnDay);
    expect((await screen.findByRole("alert")).textContent).toBe(p.error.future);
    expect(await service.periods()).toEqual([]);
  });

  it("does not fall over when saving is rejected", async () => {
    const { service } = await open([]);
    vi.spyOn(service, "savePeriod").mockRejectedValue(new Error("x"));
    press(p.startToday);
    expect((await screen.findByRole("alert")).textContent).toBe(
      "Nie udało się. Spróbuj jeszcze raz.",
    );
  });

  it("does not fall over when deleting is rejected", async () => {
    const { service } = await open(
      [entry("a", "2026-11-01", "2026-11-05")],
      "2026-11-03",
    );
    vi.spyOn(service, "deletePeriod").mockRejectedValue(new Error("x"));
    press(p.delete);
    press(p.confirm.yes);
    expect((await screen.findByRole("alert")).textContent).toBe(
      p.error.generic,
    );
  });

  it("clears the error after a success", async () => {
    const { service } = await open([]);
    const spy = vi
      .spyOn(service, "savePeriod")
      .mockRejectedValueOnce(new Error("x"));
    press(p.startToday);
    await screen.findByRole("alert");
    spy.mockRestore();
    press(p.startToday);
    await waitFor(() => {
      expect(screen.queryByRole("alert")).toBeNull();
    });
  });
});
