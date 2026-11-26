// @vitest-environment jsdom
import { cleanup, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { pl } from "../i18n/pl";
import { colors } from "../ui/theme";
import { NOW, setup, show, useSodium } from "./planner-test-support";

useSodium();
afterEach(cleanup);

const chore = {
  title: "Zmywanie",
  rule: { kind: "daily" },
  assignment: { kind: "person", person: "me" },
} as const;

const px = (element: HTMLElement, property: "minHeight" | "width") =>
  Number.parseInt(getComputedStyle(element)[property], 10);

describe("the look of the Planner", () => {
  it("keeps views and filters radios, checked only on the chosen one", async () => {
    const { platform, chores } = await setup(true);
    await chores.add(chore);
    show(platform);
    for (const [label, selected] of [
      [pl.planner.views.label, pl.planner.views.today],
      [pl.planner.filters.label, pl.planner.filters.all],
    ] as const) {
      const group = await screen.findByRole("radiogroup", { name: label });
      const radios = within(group).getAllByRole("radio");
      expect(radios.length).toBeGreaterThan(1);
      for (const radio of radios) {
        const checked = radio.getAttribute("aria-checked");
        expect(checked).toBe(radio.textContent === selected ? "true" : "false");
        expect(px(radio, "minHeight")).toBeGreaterThanOrEqual(44);
      }
    }
  });

  it("offers a named 60 px add button with a hidden icon", async () => {
    const { platform, chores } = await setup(false);
    await chores.add(chore);
    show(platform);
    const button = await screen.findByRole("button", {
      name: pl.planner.add,
    });
    expect(px(button, "width")).toBe(60);
    expect(getComputedStyle(button).height).toBe("60px");
    expect(button.querySelector("svg")?.getAttribute("aria-hidden")).toBe(
      "true",
    );
  });

  it("shows the heading of the overdue section without the danger color", async () => {
    const { platform, chores, time } = await setup(false);
    time.now = NOW - 7 * 24 * 3_600_000;
    await chores.add({
      title: "Stare",
      rule: { kind: "occasional", dueDate: "2026-11-05" },
      assignment: { kind: "person", person: "me" },
    });
    time.now = NOW;
    show(platform);
    const header = await screen.findByText(pl.planner.todo);
    expect(getComputedStyle(header).color).not.toBe("rgb(176, 0, 32)");
    expect(header.outerHTML.toLowerCase()).not.toContain(
      colors.danger.toLowerCase(),
    );
    expect(getComputedStyle(header).textTransform).toBe("uppercase");
  });
});
