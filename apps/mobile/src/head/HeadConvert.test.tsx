// @vitest-environment jsdom
import { cleanup, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { pl } from "../i18n/pl";
import {
  headOf,
  press,
  setup,
  show,
  useSodium,
} from "./head-test-screen-support";

const { convert, failed } = pl.head.actions;
const button = (title: string) =>
  screen.queryByRole("button", { name: `${convert}: ${title}` });

useSodium();
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("turn into a chore", () => {
  it("converts with one touch and keeps the thing open", async () => {
    const { platform, time } = await setup(true);
    const head = headOf(platform, time);
    await head.add({ title: "Dentysta" });
    show(platform);
    await press(`${convert}: Dentysta`);
    await screen.findByText(pl.head.inPlanner, { exact: false });
    expect(button("Dentysta")).toBeNull();
    expect(screen.getByText("Dentysta")).toBeTruthy();
    expect(screen.getByLabelText(/Dentysta, .*Jest w planerze/)).toBeTruthy();
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("works without a pair", async () => {
    const { platform, time } = await setup(false);
    await headOf(platform, time).add({ title: "Sama" });
    show(platform);
    await press(`${convert}: Sama`);
    await screen.findByText(pl.head.inPlanner, { exact: false });
    expect(button("Sama")).toBeNull();
  });

  it("says when it did not work", async () => {
    const { platform, time } = await setup(true);
    const head = headOf(platform, time);
    await head.add({ title: "Dentysta" });
    vi.spyOn(head.items, "edit").mockRejectedValue(new Error("boom"));
    show(platform);
    await press(`${convert}: Dentysta`);
    expect((await screen.findByRole("alert")).textContent).toBe(failed);
    expect(button("Dentysta")).toBeTruthy();
  });
});
