// @vitest-environment jsdom
import { cleanup, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { pl } from "../i18n/pl";
import type { PersonTones } from "../pairing/person-tone";
import { colors, contrastRatio, MIN_TOUCH_TARGET } from "../ui/theme";
import { NOW, action, setup, show, useSodium } from "./planner-test-support";

const mocks = vi.hoisted(() => {
  const tones: PersonTones = { own: "personA", partner: "personB" };
  return { tones };
});
vi.mock("../pairing/use-person-tones", () => ({
  usePersonTones: () => mocks.tones,
}));

useSodium();
afterEach(() => {
  cleanup();
  mocks.tones = { own: "personA", partner: "personB" };
});

const DAILY = { kind: "daily" } as const;
const ME = { kind: "person", person: "me" } as const;
const PARTNER = { kind: "person", person: "partner" } as const;
const DAY = 24 * 3_600_000;

const rgb = (hex: string) => {
  const n = parseInt(hex.slice(1), 16);
  return `rgb(${String((n >> 16) & 255)}, ${String((n >> 8) & 255)}, ${String(n & 255)})`;
};

/** The element with the exact text that carries a color of its own. */
const chip = (text: string) =>
  screen
    .getAllByText(text, { exact: true })
    .find((node) => getComputedStyle(node).fontWeight === "700") as HTMLElement;

describe("the look of a row", () => {
  it("colors the chip with the tone of the person", async () => {
    mocks.tones = { own: "personB", partner: "personA" };
    const { platform, chores } = await setup(true);
    await chores.add({ title: "Zmywanie", rule: DAILY, assignment: ME });
    await chores.add({ title: "Śmieci", rule: DAILY, assignment: PARTNER });
    show(platform);
    await screen.findByText("Zmywanie");
    expect(getComputedStyle(chip("Ty")).color).toBe(rgb(colors.personBText));
    expect(getComputedStyle(chip("Partner")).color).toBe(
      rgb(colors.personAText),
    );
  });

  it("gives a shared chore a neutral chip", async () => {
    const { platform, chores } = await setup(true);
    await chores.add({
      title: "Zmywanie",
      rule: DAILY,
      assignment: { kind: "both" },
    });
    show(platform);
    await screen.findByText("Zmywanie");
    expect(getComputedStyle(chip("Oboje")).color).toBe(rgb(colors.text));
  });

  it("does not use the danger color for an overdue chore of the partner", async () => {
    const { platform, chores, time } = await setup(true);
    time.now = NOW - 40 * DAY;
    await chores.add({
      title: "Stare",
      rule: { kind: "occasional", dueDate: "2026-11-05" },
      assignment: PARTNER,
    });
    time.now = NOW;
    const { container } = show(platform);
    await screen.findByText("Stare");
    expect(container.innerHTML).not.toContain(rgb(colors.danger));
    expect(container.innerHTML.toLowerCase()).not.toContain(
      colors.danger.toLowerCase(),
    );
  });

  it("marks a ticked off row with a check and a strike-through, not by color alone", async () => {
    const { platform, chores, completions } = await setup(false);
    const { id } = await chores.add({
      title: "Zmywanie",
      rule: DAILY,
      assignment: ME,
    });
    await chores.add({ title: "Śmieci", rule: DAILY, assignment: ME });
    await completions.complete(id, "2026-11-11");
    const { container } = show(platform);
    await screen.findByText("Śmieci");
    const done = screen.getByText("Zmywanie");
    expect(getComputedStyle(done).textDecorationLine).toBe("line-through");
    expect(
      getComputedStyle(screen.getByText("Śmieci")).textDecorationLine,
    ).toBe("none");
    // One check icon: the ticked off row; the open row draws an empty box.
    expect(
      container.querySelectorAll("svg path[d='M5 12.5l4.5 4.5L19 7']"),
    ).toHaveLength(1);
    expect(contrastRatio(colors.border, colors.surface)).toBeGreaterThanOrEqual(
      3,
    );
  });

  it("draws the repeat icon only for a recurring chore", async () => {
    const { platform, chores } = await setup(false);
    await chores.add({ title: "Zmywanie", rule: DAILY, assignment: ME });
    await chores.add({
      title: "Raz",
      rule: { kind: "occasional", dueDate: "2026-11-11" },
      assignment: ME,
    });
    const { container } = show(platform);
    await screen.findByText("Raz");
    expect(container.querySelectorAll("svg path[d='M18 3v5h-5']")).toHaveLength(
      1,
    );
  });

  it("reaches the release button by a plain press, 44 px targets", async () => {
    const { platform, chores, completions } = await setup(true);
    await chores.add({ title: "Zmywanie", rule: DAILY, assignment: ME });
    const { id } = await chores.add({
      title: "Śmieci",
      rule: DAILY,
      assignment: ME,
    });
    await completions.complete(id, "2026-11-11");
    show(platform);
    await screen.findByText("Zmywanie");
    for (const label of [
      pl.planner.actions.done,
      pl.planner.actions.undo,
      pl.planner.actions.release,
    ]) {
      const button = await screen.findByRole("button", { name: action(label) });
      const style = getComputedStyle(button);
      const size = (value: string) => parseFloat(value) || 0;
      expect(
        Math.max(size(style.minHeight), size(style.height)),
      ).toBeGreaterThanOrEqual(MIN_TOUCH_TARGET);
      expect(button.getAttribute("draggable")).not.toBe("true");
    }
  });
});
