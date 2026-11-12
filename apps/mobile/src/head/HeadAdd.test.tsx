// @vitest-environment jsdom
import { cleanup, fireEvent, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { pl } from "../i18n/pl";
import {
  headOf,
  press,
  setup,
  show,
  typeInto,
  useSodium,
} from "./head-test-screen-support";

const add = pl.head.add;

useSodium();
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const input = () => screen.getByLabelText<HTMLInputElement>(add.title);

describe("quick add", () => {
  it("adds with the defaults after a title and one touch, and clears the field", async () => {
    const { platform, time } = await setup(false);
    const { head } = headOf(platform, time);
    show(platform);
    await screen.findByLabelText(add.title);
    await screen.findByText(pl.head.empty);
    typeInto(add.title, "Zapisać do lekarza");
    await press(add.submit);
    expect(await screen.findByText("Zapisać do lekarza")).toBeTruthy();
    expect(await head.list()).toMatchObject([
      {
        title: "Zapisać do lekarza",
        category: "other",
        weight: 2,
        carrier: "me",
      },
    ]);
    expect(input().value).toBe("");
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("adds on a device that is not registered yet", async () => {
    const { platform, time } = await setup(false);
    await platform.database.put("identity", "device", {
      signingPublicKey: "s",
      agreementPublicKey: "a",
      deviceId: null,
    });
    const { head } = headOf(platform, time);
    show(platform);
    await screen.findByText(pl.head.empty);
    typeInto(add.title, "Bez urządzenia");
    await press(add.submit);
    expect(await screen.findByText("Bez urządzenia")).toBeTruthy();
    expect(await head.list()).toMatchObject([{ carrier: "me" }]);
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("adds on Enter", async () => {
    const { platform, time } = await setup(false);
    const { head } = headOf(platform, time);
    show(platform);
    await screen.findByLabelText(add.title);
    await screen.findByText(pl.head.empty);
    typeInto(add.title, "Enter");
    fireEvent.keyDown(input(), { key: "Enter" });
    await screen.findByText("Enter");
    expect(await head.list()).toHaveLength(1);
  });

  it("asks for a title, and not too long a one", async () => {
    const { platform, time } = await setup(false);
    const { head } = headOf(platform, time);
    show(platform);
    await screen.findByLabelText(add.title);
    await press(add.submit);
    expect((await screen.findByRole("alert")).textContent).toBe(
      add.errors.titleEmpty,
    );
    typeInto(add.title, "a".repeat(81));
    await press(add.submit);
    expect((await screen.findByRole("alert")).textContent).toBe(
      add.errors.titleTooLong,
    );
    expect(await head.list()).toEqual([]);
    typeInto(add.title, "Rzecz");
    await press(add.submit);
    await waitFor(() => {
      expect(screen.queryByRole("alert")).toBeNull();
    });
  });

  it("says when the thing cannot be added and keeps the screen", async () => {
    const { platform, time } = await setup(false);
    const { head } = headOf(platform, time);
    vi.spyOn(head, "add").mockRejectedValue(new Error("boom"));
    show(platform);
    await screen.findByLabelText(add.title);
    typeInto(add.title, "Rzecz");
    await press(add.submit);
    expect((await screen.findByRole("alert")).textContent).toBe(
      add.errors.failed,
    );
    expect(input().value).toBe("Rzecz");
    expect(screen.getByText(pl.head.empty)).toBeTruthy();
  });
});

describe("more choices", () => {
  it("adds with a category, a weight and a due date", async () => {
    const { platform, time } = await setup(false);
    const { head } = headOf(platform, time);
    show(platform);
    await screen.findByLabelText(add.title);
    await press(add.more);
    // Nobody to carry it but me, so there is nothing to choose.
    expect(screen.queryByRole("radiogroup", { name: add.carrier })).toBeNull();
    await press(pl.head.categories.children, "radio");
    await press(pl.head.weights["3"], "radio");
    typeInto(add.dueDate, "2026-12-24");
    typeInto(add.title, "Prezenty");
    await press(add.submit);
    await screen.findByText("Prezenty");
    expect(await head.list()).toMatchObject([
      { category: "children", weight: 3, dueDate: "2026-12-24", carrier: "me" },
    ]);
    expect(screen.getByLabelText<HTMLInputElement>(add.dueDate).value).toBe("");
    await press(add.less);
    expect(screen.queryByLabelText(add.dueDate)).toBeNull();
  });

  it("refuses a due date that is not a day", async () => {
    const { platform, time } = await setup(false);
    const { head } = headOf(platform, time);
    show(platform);
    await screen.findByLabelText(add.title);
    await press(add.more);
    typeInto(add.dueDate, "jutro");
    typeInto(add.title, "Rzecz");
    await press(add.submit);
    expect((await screen.findByRole("alert")).textContent).toBe(
      add.errors.dueDate,
    );
    expect(await head.list()).toEqual([]);
  });

  it("offers the carrier in a pair, by the name of the partner", async () => {
    const { platform, time } = await setup(true);
    const { head } = headOf(platform, time);
    show(platform);
    await screen.findByLabelText(add.title);
    await press(add.more);
    await press(add.carrierOptions.both, "radio");
    await press(add.carrierOptions.partner, "radio");
    typeInto(add.title, "Dentysta");
    await press(add.submit);
    await screen.findByLabelText("Dentysta, Inne, Średnia, Partner");
    expect(await head.list()).toMatchObject([{ carrier: "partner" }]);
  });
});
