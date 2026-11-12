// @vitest-environment jsdom
import { cleanup, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { pl } from "../i18n/pl";
import {
  headOf,
  receiveProfile,
  setup,
  show,
  useSodium,
} from "./head-test-screen-support";

useSodium();
afterEach(cleanup);

describe("the split on the head screen", () => {
  it("is not there without a pair", async () => {
    const { platform, time } = await setup(false);
    await headOf(platform, time).add({ title: "Rzecz" });
    show(platform);
    await screen.findByText("Rzecz");
    expect(screen.queryByText(pl.head.split.title)).toBeNull();
    expect(screen.queryByText(pl.head.trend.title)).toBeNull();
  });

  it("says there is nothing to split while no shared thing is open", async () => {
    const { platform } = await setup(true);
    show(platform);
    expect(await screen.findByText(pl.head.split.empty)).toBeTruthy();
    expect(screen.queryByText(pl.head.trend.title)).toBeNull();
  });

  it("shows 56% and 44%, and follows a takeover from the sync", async () => {
    const { platform, time } = await setup(true);
    const head = headOf(platform, time);
    await head.add({ title: "A" });
    await head.add({ title: "B" });
    await head.add({ title: "C", weight: 3, carrier: "partner" });
    await head.add({ title: "D", weight: 1, carrier: "both" });
    await receiveProfile(platform, "Ola");
    show(platform);
    expect(await screen.findByText("Ty 56%")).toBeTruthy();
    expect(screen.getByText("Ola 44%")).toBeTruthy();
    expect(screen.getByText(pl.head.trend.title)).toBeTruthy();
    const heavy = (await head.items.list()).find((i) => i.title === "C");
    time.now += 1000;
    await head.carriers.append({
      itemId: heavy?.id ?? "",
      carrier: "device-me",
      shared: true,
    });
    expect(await screen.findByText("Ty 94%")).toBeTruthy();
  });
});
