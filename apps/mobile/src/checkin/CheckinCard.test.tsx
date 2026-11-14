// @vitest-environment jsdom
import { act, cleanup, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { pl } from "../i18n/pl";
import { receiveProfile } from "../chores/planner-test-support";
import {
  press,
  setupCheckin,
  showCard,
  useSodium,
  withStatus,
} from "./checkin-test-screen-support";

const c = pl.checkin.card;
const f = pl.checkin.form;

useSodium();
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const answer = async () => {
  await press(`${f.mood}: 4 z 5`, "radio");
  await press(`${f.energy}: 3 z 5`, "radio");
  await press(`${f.closeness}: 5 z 5`, "radio");
};

describe("without the form", () => {
  it("speaks neutrally without a pair", async () => {
    const { platform } = await setupCheckin(false);
    showCard(platform);
    await screen.findByText(c.noPair);
    expect(screen.queryByText(f.save)).toBeNull();
  });

  it("says the check-in is off when the consent is off", async () => {
    const { platform } = await setupCheckin(true, false);
    showCard(platform);
    await screen.findByText(c.disabled);
    expect(screen.queryByText(f.save)).toBeNull();
  });

  it("follows the consent being turned on", async () => {
    const { platform, consent } = await setupCheckin(true, false);
    showCard(platform);
    await screen.findByText(c.disabled);
    await act(() => consent.setCategory("CHECKIN", true));
    await screen.findByText(f.save);
    expect(screen.queryByText(c.disabled)).toBeNull();
  });

  it("does not break when the loading fails", async () => {
    const { platform, checkin } = await setupCheckin(true);
    vi.spyOn(checkin, "current").mockRejectedValue(new Error("boom"));
    showCard(platform);
    expect((await screen.findByRole("alert")).textContent).toBe(
      pl.checkin.failed,
    );
  });
});

describe("the open check-in", () => {
  it("shows the form and the period of the window", async () => {
    const { platform } = await setupCheckin(true);
    showCard(platform);
    await screen.findByText("Check-in do niedzieli, 19:00");
    expect(screen.getAllByRole("radio")).toHaveLength(15);
    expect(
      screen.getByRole("button", { name: f.save }).hasAttribute("disabled"),
    ).toBe(true);
  });

  it("saves the answers and waits for the results", async () => {
    const { platform, checkin } = await setupCheckin(true);
    showCard(platform);
    await answer();
    await press(f.save);
    await screen.findByText(c.waiting);
    expect(screen.queryByRole("radio")).toBeNull();
    expect(screen.queryByRole("alert")).toBeNull();
    expect(await checkin.current()).toMatchObject({
      status: "filled",
      own: { mood: 4, energy: 3, closeness: 5 },
    });
  });

  it("shows the error and keeps the form when the saving fails", async () => {
    const { platform, checkin } = await setupCheckin(true);
    vi.spyOn(checkin, "submit").mockRejectedValue(new Error("locked"));
    showCard(platform);
    await answer();
    await press(f.save);
    expect((await screen.findByRole("alert")).textContent).toBe(
      pl.checkin.failed,
    );
    expect(screen.getAllByRole("radio")).toHaveLength(15);
  });
});

describe("after saving", () => {
  it("changes the answers from the current ones", async () => {
    const { platform, checkin } = await setupCheckin(true);
    await checkin.submit({ mood: 2, energy: 3, closeness: 4, need: "ciszy" });
    showCard(platform);
    await screen.findByText(c.waiting);
    await press(c.change);
    expect(screen.queryByRole("button", { name: c.change })).toBeNull();
    expect(
      screen
        .getByRole("radio", { name: `${f.mood}: 2 z 5` })
        .getAttribute("aria-checked"),
    ).toBe("true");
    expect(screen.getByLabelText<HTMLInputElement>(f.need).value).toBe("ciszy");
    await press(`${f.mood}: 5 z 5`, "radio");
    await press(f.save);
    await screen.findByText(c.waiting);
    expect(await checkin.current()).toMatchObject({
      own: { mood: 5, energy: 3, closeness: 4, need: "ciszy" },
    });
  });

  it("keeps the form open when the change fails", async () => {
    const { platform, checkin } = await setupCheckin(true);
    await checkin.submit({ mood: 2, energy: 3, closeness: 4 });
    showCard(platform);
    await press(c.change);
    vi.spyOn(checkin, "submit").mockRejectedValue(new Error("locked"));
    await press(f.save);
    await screen.findByRole("alert");
    expect(screen.getAllByRole("radio")).toHaveLength(15);
  });

  it("does not offer a change after the lock", async () => {
    const { platform, checkin } = await setupCheckin(true);
    await withStatus(checkin, "locked");
    showCard(platform);
    await screen.findByText(c.waiting);
    expect(screen.queryByRole("button", { name: c.change })).toBeNull();
  });

  it("shows the results read-only after the reveal", async () => {
    const { platform, checkin } = await setupCheckin(true);
    await withStatus(checkin, "revealed");
    showCard(platform);
    await screen.findByText(pl.checkin.results.title);
    expect(screen.getByText(pl.checkin.results.partner)).toBeTruthy();
    expect(screen.queryByText(c.waiting)).toBeNull();
    expect(screen.queryByRole("button")).toBeNull();
    expect(screen.queryByRole("radio")).toBeNull();
  });

  it("names the partner from the profile", async () => {
    const { platform, checkin } = await setupCheckin(true);
    await withStatus(checkin, "revealed");
    await receiveProfile(platform, "Ola");
    showCard(platform);
    await screen.findByLabelText(`${f.mood} — Ty: 4 z 5, Ola: 1 z 5`);
  });
});

describe("the partner stays hidden before the reveal", () => {
  it.each(["open", "filled"] as const)("in the %s state", async (status) => {
    const { platform, checkin } = await setupCheckin(true);
    if (status === "filled") {
      await checkin.submit({ mood: 2, energy: 3, closeness: 4 });
    }
    showCard(platform);
    await screen.findByText("Check-in do niedzieli, 19:00");
    expect(document.body.textContent).not.toMatch(/partner|wypełni/i);
  });
});

it("reloads the card after a change from the synchronization", async () => {
  const { platform, checkin } = await setupCheckin(true);
  showCard(platform);
  await screen.findByText(f.save);
  await withStatus(checkin, "revealed");
  await act(() => checkin.submit({ mood: 4, energy: 3, closeness: 5 }));
  await waitFor(() => {
    expect(screen.getByText(pl.checkin.results.title)).toBeTruthy();
  });
});
