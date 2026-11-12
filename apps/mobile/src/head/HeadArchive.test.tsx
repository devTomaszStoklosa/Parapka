// @vitest-environment jsdom
import { cleanup, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { localDate, formatDate } from "../chores/planner-model";
import { pl } from "../i18n/pl";
import {
  headOf,
  press,
  setup,
  show,
  useSodium,
} from "./head-test-screen-support";

useSodium();
afterEach(cleanup);

describe("the archive", () => {
  it("is not there while nothing is done", async () => {
    const { platform, time } = await setup(false);
    await headOf(platform, time).add({ title: "Otwarta" });
    show(platform);
    await screen.findByText("Otwarta");
    expect(screen.queryByText(/^Archiwum/)).toBeNull();
  });

  it("is collapsed, opens with the latest closed first, and collapses again", async () => {
    const { platform, time } = await setup(false);
    const head = headOf(platform, time);
    const first = await head.add({ title: "Pierwsza", category: "home" });
    const second = await head.add({ title: "Druga" });
    await head.add({ title: "Otwarta" });
    time.now += 1000;
    await head.items.complete(second.id);
    time.now += 1000;
    await head.items.complete(first.id);
    show(platform);
    await press("Archiwum (2)");
    const day = formatDate(localDate(time.now));
    const label = `Pierwsza, Dom, ${pl.head.archive.closed.replace("{date}", day)}`;
    expect(await screen.findByLabelText(label)).toBeTruthy();
    const titles = screen
      .getAllByText(/^(Pierwsza|Druga)$/)
      .map((node) => node.textContent);
    expect(titles).toEqual(["Pierwsza", "Druga"]);
    expect(screen.queryByRole("button", { name: /Załatwione: / })).toBeTruthy();
    expect(
      screen.queryByRole("button", { name: /: (Pierwsza|Druga)$/ }),
    ).toBeNull();
    await press("Archiwum (2)");
    expect(screen.queryByText("Pierwsza")).toBeNull();
  });

  it("leaves out the day of a thing without a moment of closing", async () => {
    const { platform, time } = await setup(false);
    const head = headOf(platform, time);
    const item = await head.add({ title: "Bez daty" });
    await head.items.complete(item.id);
    await head.items.complete((await head.add({ title: "Z datą" })).id);
    show(platform);
    await press("Archiwum (2)");
    expect(await screen.findByText("Bez daty")).toBeTruthy();
  });
});
