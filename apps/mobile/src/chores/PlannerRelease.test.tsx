// @vitest-environment jsdom
import { cleanup, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { pl } from "../i18n/pl";
import { press, setup, show, useSodium } from "./planner-test-support";

useSodium();
afterEach(cleanup);

const RELEASE = pl.planner.actions.release;
const rule = { kind: "daily" } as const;

describe("can't manage", () => {
  it("hands the chore to anyone with one touch and no message", async () => {
    const { platform, chores } = await setup(true);
    const { id } = await chores.add({
      title: "Zmywanie",
      rule,
      assignment: { kind: "person", person: "me" },
    });
    show(platform);
    await press(RELEASE);
    await waitFor(async () => {
      expect(
        (await chores.list()).find((chore) => chore.id === id)?.assignment,
      ).toEqual({ kind: "anyone" });
    });
    await waitFor(() => {
      expect(screen.queryByRole("button", { name: RELEASE })).toBeNull();
    });
    expect(screen.queryByRole("alert")).toBeNull();
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(screen.getByText(/Ktokolwiek/)).toBeTruthy();
  });

  it("is offered for both people", async () => {
    const { platform, chores } = await setup(true);
    await chores.add({
      title: "Zmywanie",
      rule,
      assignment: { kind: "both" },
    });
    show(platform);
    expect(await screen.findByRole("button", { name: RELEASE })).toBeTruthy();
  });

  it.each([
    ["partner", { kind: "person", person: "partner" }],
    ["anyone", { kind: "anyone" }],
  ] as const)(
    "is not offered when %s is responsible",
    async (_name, assignment) => {
      const { platform, chores } = await setup(true);
      await chores.add({ title: "Zmywanie", rule, assignment });
      show(platform);
      await screen.findByRole("button", { name: pl.planner.actions.done });
      expect(screen.queryByRole("button", { name: RELEASE })).toBeNull();
    },
  );

  it("is not offered without a pair", async () => {
    const { platform, chores } = await setup(false);
    await chores.add({
      title: "Zmywanie",
      rule,
      assignment: { kind: "person", person: "me" },
    });
    show(platform);
    await screen.findByRole("button", { name: pl.planner.actions.done });
    expect(screen.queryByRole("button", { name: RELEASE })).toBeNull();
  });

  it("is not offered for a ticked off occurrence", async () => {
    const { platform, chores, completions } = await setup(true);
    const { id } = await chores.add({
      title: "Zmywanie",
      rule,
      assignment: { kind: "both" },
    });
    await completions.complete(id, "2026-11-11");
    show(platform);
    await screen.findByRole("button", { name: pl.planner.actions.undo });
    expect(screen.queryByRole("button", { name: RELEASE })).toBeNull();
  });

  it("says so when it fails", async () => {
    const { platform, chores } = await setup(true);
    await chores.add({
      title: "Zmywanie",
      rule,
      assignment: { kind: "both" },
    });
    chores.release = () => Promise.reject(new Error("broken"));
    show(platform);
    await press(RELEASE);
    expect(await screen.findByText(pl.planner.actions.failed)).toBeTruthy();
    expect(screen.getByRole("button", { name: RELEASE })).toBeTruthy();
  });
});
