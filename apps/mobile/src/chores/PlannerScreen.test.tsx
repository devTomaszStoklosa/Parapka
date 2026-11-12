// @vitest-environment jsdom
import type { PairKeys } from "@parapka/crypto";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";
import { afterEach, beforeAll, describe, expect, it } from "vitest";

import { createMemoryDatabase } from "../data/memory-database";
import { pl } from "../i18n/pl";
import { PlatformProvider, type Platform } from "../platform/context";
import { createMemoryKeyStore } from "../platform/memory-key-store";
import { webSha256 } from "../platform/sha256";
import { createWebSodium } from "../platform/web-sodium";
import { wireChores } from "../sync/wiring";
import { PlannerScreen } from "./PlannerScreen";

// Wednesday 2026-11-11, noon.
const NOW = new Date(2026, 10, 11, 12).getTime();
const KEYS: PairKeys = {
  sendKey: new Uint8Array(32).fill(1),
  receiveKey: new Uint8Array(32).fill(2),
};
const ME = { kind: "person", person: "me" } as const;
const PARTNER = { kind: "person", person: "partner" } as const;

let sodium: Platform["sodium"];

beforeAll(async () => {
  sodium = await createWebSodium();
});

afterEach(cleanup);

const DAY = 24 * 3_600_000;

async function setup(paired: boolean) {
  // Set `time.now` back to add a chore that is older than today.
  const time = { now: NOW };
  const platform: Platform = {
    sodium,
    keyStore: createMemoryKeyStore(),
    clock: { nowMs: () => time.now },
    database: createMemoryDatabase(),
    sha256: webSha256,
    relayUrl: "unused",
    appUrl: "unused",
  };
  await platform.database.put("identity", "device", {
    signingPublicKey: "s",
    agreementPublicKey: "a",
    deviceId: "device-me",
  });
  const wired = wireChores(platform);
  if (paired) {
    await wired.pairs.savePending(
      {
        pairMailboxId: "mailbox",
        deviceId: "device-partner",
        signingPublicKey: "s",
        agreementPublicKey: "a",
      },
      KEYS,
    );
    await wired.pairs.confirm();
  }
  return { platform, time, ...wired };
}

const show = (platform: Platform) =>
  render(
    <PlatformProvider platform={platform}>
      <PlannerScreen />
    </PlatformProvider>,
  );

const upcoming = (heading: HTMLElement) => heading.parentElement as HTMLElement;

const choose = (name: string) => {
  fireEvent.click(screen.getByRole("radio", { name }));
};

describe("the planner screen", () => {
  it("shows the empty state with an active button", async () => {
    const { platform } = await setup(false);
    show(platform);
    expect(await screen.findByText(pl.planner.empty.text)).toBeTruthy();
    const button = screen.getByRole("button", { name: pl.planner.empty.add });
    expect(button.getAttribute("aria-disabled")).not.toBe("true");
  });

  it("shows only the nearest days in today and the week views", async () => {
    const { platform, chores, time } = await setup(false);
    time.now = NOW - 40 * DAY;
    await chores.add({
      title: "Wynieść śmieci",
      rule: { kind: "weekdays", weekdays: [1, 4] },
      assignment: ME,
    });
    time.now = NOW;
    show(platform);
    await screen.findByRole("heading", { name: pl.planner.todo });
    expect(
      screen.queryByRole("heading", { name: pl.planner.upcoming }),
    ).toBeNull();
    choose(pl.planner.views.week);
    const section = upcoming(
      await screen.findByRole("heading", { name: pl.planner.upcoming }),
    );
    expect(within(section).getAllByText("Wynieść śmieci")).toHaveLength(2);
    expect(within(section).getByText("Ty · 12.11.2026")).toBeTruthy();
    expect(within(section).getByText("Ty · 16.11.2026")).toBeTruthy();
    choose(pl.planner.views.all);
    expect(
      within(
        upcoming(screen.getByRole("heading", { name: pl.planner.upcoming })),
      ).getAllByText("Wynieść śmieci"),
    ).toHaveLength(9);
  });

  it("says so when the view has nothing to do", async () => {
    const { platform, chores } = await setup(false);
    await chores.add({
      title: "Przegląd",
      rule: { kind: "occasional", dueDate: "2026-12-31" },
      assignment: ME,
    });
    show(platform);
    expect(await screen.findByText(pl.planner.emptyViewText)).toBeTruthy();
    choose(pl.planner.views.all);
    expect(screen.getByText(pl.planner.emptyViewText)).toBeTruthy();
  });

  it("hides the filter without a pair", async () => {
    const { platform, chores } = await setup(false);
    await chores.add({
      title: "Zmywanie",
      rule: { kind: "daily" },
      assignment: ME,
    });
    show(platform);
    await screen.findByRole("heading", { name: pl.planner.upcoming });
    expect(
      screen.queryByRole("radiogroup", { name: pl.planner.filters.label }),
    ).toBeNull();
  });

  it("filters by the person with a pair", async () => {
    const { platform, chores } = await setup(true);
    const rule = { kind: "daily" } as const;
    await chores.add({ title: "Moje", rule, assignment: ME });
    await chores.add({ title: "Jego", rule, assignment: PARTNER });
    await chores.add({ title: "Razem", rule, assignment: { kind: "both" } });
    show(platform);
    const titles = async () =>
      within(
        upcoming(
          await screen.findByRole("heading", { name: pl.planner.upcoming }),
        ),
      )
        .queryAllByText(/^(Moje|Jego|Razem)$/)
        .map((node) => node.textContent);
    expect(await titles()).toEqual(["Jego", "Moje", "Razem"]);
    choose(pl.planner.filters.partner);
    expect(await titles()).toEqual(["Jego"]);
    choose(pl.planner.filters.shared);
    expect(await titles()).toEqual(["Razem"]);
    choose(pl.planner.filters.mine);
    expect(await titles()).toEqual(["Moje"]);
    const group = screen.getByRole("radiogroup", {
      name: pl.planner.filters.label,
    });
    fireEvent.click(
      within(group).getByRole("radio", { name: pl.planner.filters.all }),
    );
    expect(await titles()).toHaveLength(3);
  });

  it("puts the overdue of both people in one neutral section", async () => {
    const { platform, chores, completions, time } = await setup(true);
    time.now = NOW - 40 * DAY;
    const rule = { kind: "occasional", dueDate: "2026-11-05" } as const;
    await chores.add({ title: "Własne", rule, assignment: ME });
    await chores.add({ title: "Partnera", rule, assignment: PARTNER });
    const done = await chores.add({ title: "Zrobione", rule, assignment: ME });
    await completions.complete(done.id, "2026-11-05");
    time.now = NOW;
    show(platform);
    const heading = await screen.findByRole("heading", {
      name: pl.planner.todo,
    });
    const section = heading.parentElement as HTMLElement;
    const own = within(section).getByLabelText(/^Własne/);
    const theirs = within(section).getByLabelText(/^Partnera/);
    expect(within(section).queryByText("Zrobione")).toBeNull();
    expect(own.getAttribute("style")).toBe(theirs.getAttribute("style"));
    expect(own.children).toHaveLength(theirs.children.length);
  });

  it("shows whether an occurrence is ticked off", async () => {
    const { platform, chores, completions } = await setup(false);
    const { id } = await chores.add({
      title: "Zmywanie",
      rule: { kind: "daily" },
      assignment: ME,
    });
    await completions.complete(id, "2026-11-11");
    show(platform);
    expect(await screen.findByText(pl.planner.done)).toBeTruthy();
    expect(screen.getAllByText(pl.planner.done)).toHaveLength(1);
    expect(screen.getByLabelText(/Odhaczone$/)).toBeTruthy();
  });

  it("says so when the chores do not load", async () => {
    const { platform, chores } = await setup(false);
    chores.list = () => Promise.reject(new Error("broken"));
    show(platform);
    expect(await screen.findByText(pl.planner.failed)).toBeTruthy();
  });
});
