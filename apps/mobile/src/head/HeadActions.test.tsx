// @vitest-environment jsdom
import { cleanup, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { pl } from "../i18n/pl";
import {
  headOf,
  press,
  receiveProfile,
  setup,
  show,
  useSodium,
} from "./head-test-screen-support";

const { takeOver, done, failed } = pl.head.actions;
const takeOverButton = (title: string) =>
  screen.queryByRole("button", { name: `${takeOver}: ${title}` });

useSodium();
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("I take it", () => {
  it("takes over a thing of the partner with one touch", async () => {
    const { platform, time } = await setup(true);
    const head = headOf(platform, time);
    const item = await head.add({ title: "Dentysta", carrier: "partner" });
    show(platform);
    await press(`${takeOver}: Dentysta`);
    await screen.findByLabelText("Dentysta, Inne, Średnia, Ty");
    expect(
      (await head.head.list()).find(({ id }) => id === item.id),
    ).toMatchObject({ carrier: "me" });
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("takes over a thing of both", async () => {
    const { platform, time } = await setup(true);
    await headOf(platform, time).add({ title: "Oboje", carrier: "both" });
    show(platform);
    await press(`${takeOver}: Oboje`);
    await screen.findByLabelText("Oboje, Inne, Średnia, Ty");
  });

  it("offers it only for a shared thing of the partner or of both", async () => {
    const { platform, time } = await setup(true);
    const head = headOf(platform, time);
    await head.add({ title: "Moja" });
    await head
      .add({ title: "Prywatna", carrier: "partner" }, { private: true })
      .catch(() => undefined);
    await head.add({ title: "Prywatna moja" }, { private: true });
    const loose = await head.items.add({ title: "Bez nikogo" });
    expect(loose.shared).toBe(true);
    await head.add({ title: "Partnera", carrier: "partner" });
    show(platform);
    await screen.findByText("Partnera");
    expect(takeOverButton("Partnera")).toBeTruthy();
    for (const title of ["Moja", "Prywatna moja", "Bez nikogo"]) {
      expect(takeOverButton(title)).toBeNull();
    }
  });

  it("is not offered without a pair", async () => {
    const { platform, time } = await setup(false);
    await headOf(platform, time).add({ title: "Sama" });
    show(platform);
    await screen.findByText("Sama");
    expect(takeOverButton("Sama")).toBeNull();
    expect(screen.getByRole("button", { name: `${done}: Sama` })).toBeTruthy();
  });

  it("shows the name of the one who took it to the partner", async () => {
    const { platform, time } = await setup(true);
    const head = headOf(platform, time);
    const item = await head.add({ title: "Wspólna", carrier: "partner" });
    await receiveProfile(platform, "Ola");
    show(platform);
    await screen.findByLabelText("Wspólna, Inne, Średnia, Ola");
    // The partner takes it over: their entry arrives after ours.
    time.now += 1000;
    await head.carriers.append({
      itemId: item.id,
      carrier: "device-me",
      shared: true,
    });
    await screen.findByLabelText("Wspólna, Inne, Średnia, Ty");
    time.now += 1000;
    await head.carriers.append({
      itemId: item.id,
      carrier: "device-partner",
      shared: true,
    });
    await screen.findByLabelText("Wspólna, Inne, Średnia, Ola");
    expect(takeOverButton("Wspólna")).toBeTruthy();
  });

  it("says when it did not work and keeps the screen", async () => {
    const { platform, time } = await setup(true);
    const head = headOf(platform, time);
    await head.add({ title: "Dentysta", carrier: "partner" });
    vi.spyOn(head.head, "takeOver").mockRejectedValue(new Error("boom"));
    show(platform);
    await press(`${takeOver}: Dentysta`);
    expect((await screen.findByRole("alert")).textContent).toBe(failed);
    expect(screen.getByText("Dentysta")).toBeTruthy();
  });
});

describe("done", () => {
  it("closes a thing with one touch and clears an earlier error", async () => {
    const { platform, time } = await setup(false);
    const head = headOf(platform, time);
    await head.add({ title: "Raz" });
    await head.add({ title: "Dwa" });
    const complete = vi
      .spyOn(head.items, "complete")
      .mockRejectedValueOnce(new Error("boom"));
    show(platform);
    await press(`${done}: Raz`);
    expect((await screen.findByRole("alert")).textContent).toBe(failed);
    await press(`${done}: Raz`);
    await waitFor(() => {
      expect(screen.queryByText("Raz")).toBeNull();
    });
    expect(screen.queryByRole("alert")).toBeNull();
    expect(complete).toHaveBeenCalledTimes(2);
    expect(screen.getByText("Dwa")).toBeTruthy();
    expect(screen.getByText("Archiwum (1)")).toBeTruthy();
  });

  it("closes a thing that the partner closed meanwhile without a reload", async () => {
    const { platform, time } = await setup(true);
    const head = headOf(platform, time);
    const item = await head.add({ title: "Wspólna", carrier: "both" });
    show(platform);
    await screen.findByText("Wspólna");
    await head.items.complete(item.id);
    await waitFor(() => {
      expect(screen.queryByText("Wspólna")).toBeNull();
    });
    expect(screen.getByText("Archiwum (1)")).toBeTruthy();
  });
});
