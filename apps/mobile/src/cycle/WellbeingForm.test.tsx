// @vitest-environment jsdom
import { cleanup, fireEvent, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { pl } from "../i18n/pl";
import { cycleOf, setup, show, useSodium } from "./cycle-screen-test-support";

useSodium();
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const radio = (name: string) => screen.getByRole("radio", { name });
const save = () =>
  screen.getByRole("button", { name: pl.cycle.wellbeing.save });
const rate = (label: string, value: number) => {
  fireEvent.click(radio(`${label}: ${String(value)} z 5`));
};

async function open() {
  const { platform } = await setup(false);
  show(platform);
  await screen.findByText(pl.cycle.wellbeing.privacy);
  return platform;
}

describe("the wellbeing form", () => {
  it("saves only after the three required ratings and shows the privacy text", async () => {
    const platform = await open();
    const disabled = () => String(save().getAttribute("aria-disabled"));
    expect(disabled()).toBe("true");
    rate("Energia", 2);
    rate("Nastrój", 4);
    expect(disabled()).toBe("true");
    rate("Napięcie", 3);
    expect(disabled()).toBe("null");
    expect(radio("Energia: 2 z 5").getAttribute("aria-checked")).toBe("true");
    expect(pl.cycle.wellbeing.privacy).toBe(
      "Wpis zostaje tylko na tym telefonie. Partner go nie zobaczy.",
    );
    fireEvent.click(save());
    await vi.waitFor(async () => {
      expect(await cycleOf(platform).wellbeingOn("2026-11-11")).toEqual({
        date: "2026-11-11",
        energy: 2,
        mood: 4,
        tension: 3,
        tags: [],
      });
    });
  });

  it("clears the optional desire, toggles tags and limits the note", async () => {
    const platform = await open();
    rate("Energia", 1);
    rate("Nastrój", 1);
    rate("Napięcie", 1);
    rate("Ochota", 5);
    rate("Ochota", 5);
    expect(radio("Ochota: 5 z 5").getAttribute("aria-checked")).toBe("false");
    rate("Ochota", 2);
    fireEvent.click(screen.getByRole("checkbox", { name: "Ból głowy" }));
    fireEvent.click(screen.getByRole("checkbox", { name: "Skurcze" }));
    fireEvent.click(screen.getByRole("checkbox", { name: "Ból głowy" }));
    fireEvent.change(screen.getByLabelText(pl.cycle.wellbeing.note), {
      target: { value: "x".repeat(300) },
    });
    expect(screen.getByText("280/280")).toBeTruthy();
    fireEvent.click(save());
    await vi.waitFor(async () => {
      const entry = await cycleOf(platform).wellbeingOn("2026-11-11");
      expect(entry?.desire).toBe(2);
      expect(entry?.tags).toEqual(["cramps"]);
      expect(entry?.note).toHaveLength(280);
    });
  });

  it("opens today's entry and corrects it", async () => {
    const { platform } = await setup(false);
    const cycle = cycleOf(platform);
    await cycle.saveWellbeing({
      date: "2026-11-11",
      energy: 3,
      mood: 3,
      tension: 3,
      desire: 4,
      tags: ["sleep"],
      note: "ok",
    });
    show(platform);
    await screen.findByText(pl.cycle.wellbeing.privacy);
    expect(radio("Ochota: 4 z 5").getAttribute("aria-checked")).toBe("true");
    expect(
      screen
        .getByRole("checkbox", { name: "Gorszy sen" })
        .getAttribute("aria-checked"),
    ).toBe("true");
    rate("Energia", 5);
    fireEvent.click(save());
    await vi.waitFor(async () => {
      expect((await cycle.wellbeingOn("2026-11-11"))?.energy).toBe(5);
    });
    expect((await cycle.wellbeingOn("2026-11-11"))?.note).toBe("ok");
  });

  it("shows the error when saving fails and keeps the screen", async () => {
    const platform = await open();
    vi.spyOn(cycleOf(platform), "saveWellbeing").mockRejectedValue(
      new Error("x"),
    );
    rate("Energia", 1);
    rate("Nastrój", 1);
    rate("Napięcie", 1);
    fireEvent.click(save());
    expect((await screen.findByRole("alert")).textContent).toBe(
      "Nie udało się. Spróbuj jeszcze raz.",
    );
    expect(screen.getByText("listopad 2026")).toBeTruthy();
  });
});
