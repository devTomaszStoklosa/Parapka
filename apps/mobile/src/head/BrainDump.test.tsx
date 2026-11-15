// @vitest-environment jsdom
import { cleanup, fireEvent, screen } from "@testing-library/react";
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
const dump = pl.head.dump;

useSodium();
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const input = () => screen.getByLabelText<HTMLInputElement>(dump.title);

async function open(paired: boolean) {
  const made = await setup(paired);
  show(made.platform);
  await screen.findByText(pl.head.empty);
  // The invitation in a pair has its own start; the plain button is the one.
  await press(dump.open);
  await screen.findByLabelText(dump.title);
  return made;
}

describe("brain dump", () => {
  it("replaces the quick add, keeps the list, and adds one after another", async () => {
    const { platform, time } = await open(false);
    const { head } = headOf(platform, time);
    expect(screen.queryByLabelText(add.title)).toBeNull();
    typeInto(dump.title, "Pierwsza");
    await press(add.submit);
    await screen.findAllByText("Pierwsza");
    expect(input().value).toBe("");
    expect(document.activeElement).toBe(input());
    input().blur();
    typeInto(dump.title, "Druga");
    fireEvent.keyDown(input(), { key: "Enter" });
    await screen.findAllByText("Druga");
    expect(document.activeElement).toBe(input());
    expect(await head.list()).toMatchObject([
      { category: "other", weight: 2, carrier: "me", dueDate: null },
      { category: "other", weight: 2, carrier: "me", dueDate: null },
    ]);
    await press(dump.done);
    expect(screen.getByLabelText(add.title)).toBeTruthy();
    expect(screen.queryByLabelText(dump.title)).toBeNull();
  });

  it("keeps things private without a pair, also on an unregistered device", async () => {
    const { platform, time } = await setup(false);
    await platform.database.put("identity", "device", {
      signingPublicKey: "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA",
      agreementPublicKey: "a",
      deviceId: null,
    });
    show(platform);
    await screen.findByText(pl.head.empty);
    await press(dump.open);
    typeInto(dump.title, "Sama");
    await press(add.submit);
    await screen.findAllByText("Sama");
    const { items, head } = headOf(platform, time);
    expect(await items.list()).toMatchObject([{ shared: false }]);
    expect(await head.list()).toMatchObject([{ carrier: "me" }]);
  });

  it("shares things in a pair", async () => {
    const { platform, time } = await open(true);
    typeInto(dump.title, "Wspólna");
    await press(add.submit);
    await screen.findAllByText("Wspólna");
    expect(await headOf(platform, time).items.list()).toMatchObject([
      { shared: true },
    ]);
  });

  it("asks for a title, and not too long a one", async () => {
    const { platform, time } = await open(false);
    await press(add.submit);
    expect((await screen.findByRole("alert")).textContent).toBe(
      add.errors.titleEmpty,
    );
    typeInto(dump.title, "a".repeat(81));
    await press(add.submit);
    expect((await screen.findByRole("alert")).textContent).toBe(
      add.errors.titleTooLong,
    );
    expect(await headOf(platform, time).head.list()).toEqual([]);
  });

  it("says when the thing cannot be added and keeps the title", async () => {
    const { platform, time } = await open(false);
    vi.spyOn(headOf(platform, time).head, "add").mockRejectedValue(
      new Error("boom"),
    );
    typeInto(dump.title, "Rzecz");
    await press(add.submit);
    expect((await screen.findByRole("alert")).textContent).toBe(
      add.errors.failed,
    );
    expect(input().value).toBe("Rzecz");
    expect(screen.queryByText("Rzecz", { selector: "div" })).toBeNull();
  });
});
