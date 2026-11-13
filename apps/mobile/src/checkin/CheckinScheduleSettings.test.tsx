// @vitest-environment jsdom
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import type { CheckinSchedule } from "@parapka/domain";
import { afterEach, expect, it, vi } from "vitest";

import { createMemoryDatabase } from "../data/memory-database";
import { pl } from "../i18n/pl";
import { PlatformProvider, type Platform } from "../platform/context";
import { createMemoryKeyStore } from "../platform/memory-key-store";
import { webSha256 } from "../platform/sha256";
import { createWebSodium } from "../platform/web-sodium";
import {
  CheckinScheduleEntry,
  CheckinScheduleSettings,
} from "./CheckinScheduleSettings";
import type { ScheduleSource } from "./use-checkin-schedule";

const c = pl.checkin;

afterEach(cleanup);

const flush = () => act(() => Promise.resolve());

/** Doubles of the repositories; `emit` plays a change of the schedule or the pair. */
function setup(
  options: {
    paired?: boolean;
    loadFails?: boolean;
    setFails?: boolean;
  } = {},
) {
  const listeners = new Set<() => void>();
  const state = {
    schedule: { weekday: 7, hour: 19, minute: 0 } as CheckinSchedule,
  };
  const subscribe = (listener: () => void) => {
    const entry = () => {
      listener();
    };
    listeners.add(entry);
    return () => {
      listeners.delete(entry);
    };
  };
  const emit = () => {
    for (const listener of [...listeners]) listener();
  };
  const set = vi.fn((next: CheckinSchedule) =>
    options.setFails
      ? Promise.reject(new Error("rejected"))
      : Promise.resolve().then(() => {
          state.schedule = next;
          emit();
        }),
  );
  const source = {
    schedule: {
      get: () =>
        options.loadFails
          ? Promise.reject(new Error("unreadable"))
          : Promise.resolve(state.schedule),
      set,
      subscribe,
    },
    pairs: {
      activePair: () =>
        Promise.resolve(options.paired === false ? null : ({} as never)),
      subscribe,
    },
  } satisfies ScheduleSource;
  return { source, set, state, emit, listeners };
}

async function open(options?: Parameters<typeof setup>[0]) {
  const doubles = setup(options);
  const view = render(<CheckinScheduleSettings {...doubles.source} />);
  await flush();
  return { ...doubles, view };
}

it("shows the current term and the description", async () => {
  await open();
  expect(screen.getByText("Check-in: niedziela, 19:00")).toBeTruthy();
  expect(screen.getByText(c.description)).toBeTruthy();
});

it("offers the days from Monday and the hours and minutes as radios", async () => {
  await open();
  const days = screen.getByRole("radiogroup", { name: c.dayGroup });
  const names = [...days.querySelectorAll("[role=radio]")].map((node) =>
    node.getAttribute("aria-label"),
  );
  expect(names).toEqual([
    "Poniedziałek",
    "Wtorek",
    "Środa",
    "Czwartek",
    "Piątek",
    "Sobota",
    "Niedziela",
  ]);
  expect(screen.getAllByRole("radio", { checked: true })).toHaveLength(3);
  expect(
    screen
      .getByRole("radio", { name: "Niedziela" })
      .getAttribute("aria-checked"),
  ).toBe("true");
  expect(
    screen
      .getByRole("radio", { name: "Godzina 19" })
      .getAttribute("aria-checked"),
  ).toBe("true");
  expect(
    screen
      .getByRole("radio", { name: "Minuta 00" })
      .getAttribute("aria-checked"),
  ).toBe("true");
  expect(screen.getAllByRole("radio", { name: /^Godzina / })).toHaveLength(24);
  expect(screen.getAllByRole("radio", { name: /^Minuta / })).toHaveLength(4);
});

it.each([
  ["Wtorek", { weekday: 2, hour: 19, minute: 0 }, "wtorek, 19:00"],
  ["Godzina 07", { weekday: 7, hour: 7, minute: 0 }, "niedziela, 07:00"],
  ["Minuta 45", { weekday: 7, hour: 19, minute: 45 }, "niedziela, 19:45"],
])(
  "saves %s with one tap and shows the new value",
  async (name, saved, shown) => {
    const { set } = await open();
    fireEvent.click(screen.getByRole("radio", { name }));
    await flush();
    expect(set).toHaveBeenCalledWith(saved);
    expect(screen.queryByRole("alert")).toBeNull();
    expect(screen.getByText(`Check-in: ${shown}`)).toBeTruthy();
  },
);

it("shows nothing without a pair", async () => {
  const { view } = await open({ paired: false });
  expect(view.container.textContent).toBe("");
});

it("reloads when the partner changes the schedule or the pair appears", async () => {
  const { state, emit } = await open();
  state.schedule = { weekday: 3, hour: 8, minute: 15 };
  emit();
  await flush();
  expect(screen.getByText("Check-in: środa, 08:15")).toBeTruthy();
});

it("says that saving failed and keeps the screen", async () => {
  const { set } = await open({ setFails: true });
  fireEvent.click(screen.getByRole("radio", { name: "Wtorek" }));
  await flush();
  expect(screen.getByRole("alert").textContent).toBe(c.failed);
  expect(screen.getByText("Check-in: niedziela, 19:00")).toBeTruthy();
  fireEvent.click(screen.getByRole("radio", { name: "Środa" }));
  expect(screen.queryByRole("alert")).toBeNull();
  await flush();
  expect(set).toHaveBeenCalledTimes(2);
});

it("hides the section when the schedule cannot be read", async () => {
  const { view } = await open({ loadFails: true });
  expect(view.container.textContent).toBe("");
});

it("stops listening and ignores a late load after unmount", async () => {
  const { view, listeners, emit } = await open();
  expect(listeners.size).toBe(2);
  emit();
  view.unmount();
  expect(listeners.size).toBe(0);
  await flush();
});

it("is wired to the platform and shows nothing without a pair", async () => {
  const platform: Platform = {
    sodium: await createWebSodium(),
    keyStore: createMemoryKeyStore(),
    clock: { nowMs: () => 1_000 },
    database: createMemoryDatabase(),
    sha256: webSha256,
    relayUrl: "unused",
    appUrl: "unused",
  };
  const view = render(
    <PlatformProvider platform={platform}>
      <CheckinScheduleEntry />
    </PlatformProvider>,
  );
  await flush();
  expect(view.container.textContent).toBe("");
});
