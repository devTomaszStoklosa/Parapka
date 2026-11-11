// @vitest-environment jsdom
import { act, cleanup, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { receiveProfile, setup, show, useSodium } from "./planner-test-support";

const PARTNER = { kind: "person", person: "partner" } as const;
const chore = {
  title: "Zakupy",
  rule: { kind: "occasional", dueDate: "2026-11-11" },
  assignment: PARTNER,
} as const;

useSodium();
afterEach(cleanup);

describe("the name of the partner in a row", () => {
  it("shows the name from the profile, also for accessibility", async () => {
    const { platform, chores } = await setup(true);
    await chores.add(chore);
    await receiveProfile(platform, "Ola");
    show(platform);
    expect(await screen.findByText("Ola · 11.11.2026")).toBeTruthy();
    expect(screen.getByLabelText("Zakupy, Ola, 11.11.2026")).toBeTruthy();
  });

  it("keeps the word Partner without a profile", async () => {
    const { platform, chores } = await setup(true);
    await chores.add(chore);
    show(platform);
    expect(await screen.findByText("Partner · 11.11.2026")).toBeTruthy();
    expect(screen.getByLabelText("Zakupy, Partner, 11.11.2026")).toBeTruthy();
  });

  it("takes the name in when the profile arrives", async () => {
    const { platform, chores } = await setup(true);
    await chores.add(chore);
    show(platform);
    await screen.findByText("Partner · 11.11.2026");
    await act(async () => {
      await receiveProfile(platform, "Ola");
    });
    expect(await screen.findByText("Ola · 11.11.2026")).toBeTruthy();
  });
});
