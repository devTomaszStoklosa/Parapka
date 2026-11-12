// @vitest-environment jsdom
import { act, cleanup, fireEvent, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { pl } from "../i18n/pl";
import { colors, contrastRatio } from "../ui/theme";
import { openRow, setup, show, useSodium } from "./planner-test-support";

const form = pl.planner.form;
const DELETED = "Usunięto: Zmywanie";
const chore = {
  title: "Zmywanie",
  rule: { kind: "daily" },
  assignment: { kind: "person", person: "me" },
} as const;

useSodium();
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

const click = (name: string) => {
  fireEvent.click(screen.getByRole("button", { name }));
};

/** Deletes the chore from its form; the clock is fake from then on. */
async function deleteIt() {
  await openRow("Zmywanie");
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
  click(form.delete);
  await vi.waitFor(() => screen.getByText(DELETED));
}

describe("deleting a chore", () => {
  it("removes it and offers Undo for ten seconds", async () => {
    const { platform, chores } = await setup(false);
    await chores.add(chore);
    show(platform);
    await deleteIt();
    expect(await chores.list()).toEqual([]);
    expect(screen.getByText(pl.planner.empty.text)).toBeTruthy();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(9_000);
    });
    expect(screen.getByText(DELETED)).toBeTruthy();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1_000);
    });
    expect(screen.queryByText(DELETED)).toBeNull();
    expect(await chores.list()).toEqual([]);
  });

  it("keeps the bar outside the scrolling content", async () => {
    const { platform, chores } = await setup(false);
    await chores.add(chore);
    show(platform);
    await deleteIt();
    const bar = screen.getByRole("alert");
    expect(screen.getByTestId("planner-scroll").contains(bar)).toBe(false);
    expect(bar.style.backgroundColor).not.toBe("");
    expect(bar.style.borderTopWidth).toBe("1px");
  });

  it("uses colors that set it apart and stay readable", () => {
    expect(colors.background).not.toBe(colors.surface);
    expect(contrastRatio(colors.text, colors.background)).toBeGreaterThan(4.5);
    expect(contrastRatio(colors.border, colors.background)).toBeGreaterThan(3);
    expect(contrastRatio(colors.border, colors.surface)).toBeGreaterThan(3);
  });

  it("gives every deletion its own ten seconds", async () => {
    const { platform, chores } = await setup(false);
    await chores.add(chore);
    await chores.add({ ...chore, title: "Pranie" });
    show(platform);
    await deleteIt();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(6_000);
    });
    const [row] = screen.getAllByRole("button", { name: /^Pranie, / });
    fireEvent.click(row as HTMLElement);
    click(form.delete);
    await vi.waitFor(() => screen.getByText("Usunięto: Pranie"));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(6_000);
    });
    expect(screen.getByText("Usunięto: Pranie")).toBeTruthy();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(4_000);
    });
    expect(screen.queryByText("Usunięto: Pranie")).toBeNull();
  });

  it("restores the chore with Undo", async () => {
    const { platform, chores } = await setup(false);
    const { id } = await chores.add(chore);
    show(platform);
    await deleteIt();
    click(pl.planner.undo.button);
    await vi.waitFor(async () => {
      expect(await chores.list()).toMatchObject([{ id, title: "Zmywanie" }]);
    });
    await vi.waitFor(() => {
      expect(screen.queryByText(DELETED)).toBeNull();
    });
    expect(screen.getAllByText("Zmywanie").length).toBeGreaterThan(0);
  });

  it("says so when Undo fails", async () => {
    const { platform, chores } = await setup(false);
    await chores.add(chore);
    show(platform);
    await deleteIt();
    chores.restore = () => Promise.reject(new Error("broken"));
    click(pl.planner.undo.button);
    await vi.waitFor(() => screen.getByText(pl.planner.undo.failed));
  });

  it("says so when the chore is not deleted", async () => {
    const { platform, chores } = await setup(false);
    await chores.add(chore);
    chores.remove = () => Promise.reject(new Error("broken"));
    show(platform);
    await openRow("Zmywanie");
    click(form.delete);
    await screen.findByText(form.errors.delete);
    expect(screen.queryByText(DELETED)).toBeNull();
  });
});
