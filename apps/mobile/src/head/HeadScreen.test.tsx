// @vitest-environment jsdom
import { cleanup, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { pl } from "../i18n/pl";
import {
  headOf,
  receiveProfile,
  setup,
  show,
  useSodium,
} from "./head-test-screen-support";

useSodium();
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const label = (who: string) => `Rzecz, Inne, Średnia, ${who}`;

describe("the list of the head", () => {
  it("encourages adding the first thing when there is nothing", async () => {
    const { platform } = await setup(false);
    show(platform);
    expect(await screen.findByText(pl.head.empty)).toBeTruthy();
    expect(screen.getByRole("heading").textContent).toBe(pl.screens.head.title);
  });

  it("shows the open things, those with a due date first", async () => {
    const { platform, time } = await setup(true);
    const head = headOf(platform, time);
    await head.add({ title: "Stara" });
    await head.add({
      title: "Pilna",
      category: "health",
      weight: 3,
      dueDate: "2026-11-20",
    });
    const done = await head.add({ title: "Gotowa" });
    await head.items.complete(done.id);
    await head.add({ title: "Nowa", carrier: "both" });
    show(platform);
    await screen.findByText("Pilna");
    const titles = screen
      .getAllByText(/^(Stara|Pilna|Gotowa|Nowa)$/)
      .map((node) => node.textContent);
    expect(titles).toEqual(["Pilna", "Nowa", "Stara"]);
    expect(
      screen.getByLabelText("Pilna, Zdrowie, Duża, Ty, Termin 20.11.2026"),
    ).toBeTruthy();
    expect(screen.getByLabelText("Nowa, Inne, Średnia, Oboje")).toBeTruthy();
  });

  it("names the partner once the profile has arrived", async () => {
    const { platform, time } = await setup(true);
    const head = headOf(platform, time);
    const item = await head.items.add({ title: "Rzecz" });
    await head.carriers.append({
      itemId: item.id,
      carrier: "device-partner",
      shared: true,
    });
    show(platform);
    expect(await screen.findByLabelText(label("Partner"))).toBeTruthy();
    await receiveProfile(platform, "Ola");
    expect(await screen.findByLabelText(label("Ola"))).toBeTruthy();
  });

  it("shows a thing without an entry as unassigned until the entry arrives", async () => {
    const { platform, time } = await setup(true);
    const head = headOf(platform, time);
    const item = await head.items.add({ title: "Rzecz" });
    show(platform);
    expect(await screen.findByLabelText(label("Bez przypisania"))).toBeTruthy();
    expect(screen.queryByLabelText(label("Ty"))).toBeNull();
    await head.carriers.append({
      itemId: item.id,
      carrier: "device-me",
      shared: true,
    });
    expect(await screen.findByLabelText(label("Ty"))).toBeTruthy();
    expect(screen.queryByLabelText(label("Bez przypisania"))).toBeNull();
  });

  it("shows a thing that arrived from the sync without a reload", async () => {
    const { platform, time } = await setup(false);
    show(platform);
    await screen.findByText(pl.head.empty);
    await headOf(platform, time).add({ title: "Z synchronizacji" });
    expect(await screen.findByText("Z synchronizacji")).toBeTruthy();
    expect(screen.queryByText(pl.head.empty)).toBeNull();
  });

  it("works on a device that is not registered yet", async () => {
    const { platform, time } = await setup(false);
    await platform.database.put("identity", "device", {
      signingPublicKey: "s",
      agreementPublicKey: "a",
      deviceId: null,
    });
    await headOf(platform, time).add({ title: "Prywatna" });
    show(platform);
    expect(
      await screen.findByLabelText("Prywatna, Inne, Średnia, Ty"),
    ).toBeTruthy();
    expect(screen.queryByText(pl.head.failed)).toBeNull();
  });

  it("shows a message instead of the list when it does not load", async () => {
    const { platform, time } = await setup(false);
    const { head } = headOf(platform, time);
    vi.spyOn(head, "list").mockRejectedValue(new Error("boom"));
    show(platform);
    expect(await screen.findByText(pl.head.failed)).toBeTruthy();
    expect(screen.queryByText(pl.head.empty)).toBeNull();
  });
});
