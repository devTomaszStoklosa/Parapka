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
import { wireHead } from "./wiring";

const { failed } = pl.head.actions;

useSodium();
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

async function withRequest() {
  const { platform, time } = await setup(true);
  const head = headOf(platform, time);
  const item = await head.add({ title: "Oboje", carrier: "both" });
  await wireHead(platform).handovers.append({
    requestId: "request-1",
    itemId: item.id,
    requestedBy: "device-partner",
    status: "pending",
    shared: true,
  });
  return platform;
}

describe("when it did not work", () => {
  it("says so when the request is rejected", async () => {
    const { platform, time } = await setup(true);
    await headOf(platform, time).add({ title: "Moja" });
    vi.spyOn(wireHead(platform).handover, "requestHandover").mockRejectedValue(
      new Error("boom"),
    );
    show(platform);
    await press(`${pl.head.handover.request}: Moja`);
    expect((await screen.findByRole("alert")).textContent).toBe(failed);
    expect(screen.getByText("Moja")).toBeTruthy();
  });

  it("says so when accepting is rejected", async () => {
    const platform = await withRequest();
    vi.spyOn(wireHead(platform).handover, "acceptHandover").mockRejectedValue(
      new Error("boom"),
    );
    show(platform);
    await press("Przyjmij prośbę: Oboje");
    expect((await screen.findByRole("alert")).textContent).toBe(failed);
    expect(screen.getByText("Partner prosi o przejęcie")).toBeTruthy();
  });

  it("says so when declining is rejected", async () => {
    const platform = await withRequest();
    vi.spyOn(wireHead(platform).handover, "declineHandover").mockRejectedValue(
      new Error("boom"),
    );
    show(platform);
    await press("Odmów prośby: Oboje");
    expect((await screen.findByRole("alert")).textContent).toBe(failed);
  });

  it("hides the section when the requests do not load", async () => {
    const platform = await withRequest();
    const service = wireHead(platform).handover;
    vi.spyOn(service, "incoming").mockRejectedValue(new Error("boom"));
    show(platform);
    await screen.findByText("Oboje");
    expect(screen.queryByText("Partner prosi o przejęcie")).toBeNull();
    expect(screen.queryByRole("alert")).toBeNull();
  });
});
