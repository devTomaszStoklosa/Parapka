// @vitest-environment jsdom
import { cleanup, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { pl } from "../i18n/pl";
import { press, setup, show, useSodium } from "./head-test-screen-support";

const dump = pl.head.dump;
const DAY = 24 * 60 * 60 * 1000;

useSodium();
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const offer = () => screen.queryByText(dump.offer);

describe("brain dump offer", () => {
  it("starts the dump and hides while it lasts", async () => {
    const { platform } = await setup(true);
    show(platform);
    await screen.findByText(dump.offer);
    await press(dump.start);
    await screen.findByLabelText(dump.title);
    expect(offer()).toBeNull();
    await press(dump.done);
    await screen.findByText(dump.offer);
  });

  it("is dismissed for good for the pair", async () => {
    const { platform } = await setup(true);
    show(platform);
    await screen.findByText(dump.offer);
    await press(dump.later);
    expect(offer()).toBeNull();
    cleanup();
    show(platform);
    await screen.findByText(pl.head.empty);
    await waitFor(() => {
      expect(offer()).toBeNull();
    });
  });

  it("is gone after 7 days", async () => {
    const { platform, time } = await setup(true);
    show(platform);
    await screen.findByText(dump.offer);
    cleanup();
    time.now += 7 * DAY;
    show(platform);
    await screen.findByText(pl.head.empty);
    expect(offer()).toBeNull();
  });

  it("is not there without a pair", async () => {
    const { platform } = await setup(false);
    show(platform);
    await screen.findByText(pl.head.empty);
    expect(offer()).toBeNull();
  });

  it("hides when the record cannot be read", async () => {
    const { platform } = await setup(true);
    const get = platform.database.get.bind(platform.database);
    vi.spyOn(platform.database, "get").mockImplementation((collection, id) =>
      collection === "dump-offer"
        ? Promise.reject(new Error("boom"))
        : get(collection, id),
    );
    show(platform);
    await screen.findByText(pl.head.empty);
    expect(offer()).toBeNull();
  });

  it("hides, without breaking the screen, when dismissing cannot be saved", async () => {
    const { platform } = await setup(true);
    show(platform);
    await screen.findByText(dump.offer);
    const put = platform.database.put.bind(platform.database);
    vi.spyOn(platform.database, "put").mockImplementation((c, id, value) =>
      c === "dump-offer"
        ? Promise.reject(new Error("boom"))
        : put(c, id, value),
    );
    await press(dump.later);
    expect(offer()).toBeNull();
    expect(screen.getByText(pl.head.empty)).toBeTruthy();
  });
});
