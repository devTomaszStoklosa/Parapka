// @vitest-environment jsdom
import { cleanup, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { pl } from "../i18n/pl";
import {
  headOf,
  press,
  receiveProfile,
  setup,
  show,
  useSodium,
} from "./head-test-screen-support";
import { wireHead } from "./wiring";

const { request, waiting } = pl.head.handover;
const requestButton = (title: string) =>
  screen.queryByRole("button", { name: `${request}: ${title}` });

useSodium();
afterEach(cleanup);

/** The partner asks me to take over: their entry about the item. */
async function partnerAsks(
  platform: Parameters<typeof wireHead>[0],
  itemId: string,
) {
  await wireHead(platform).handovers.append({
    requestId: "request-1",
    itemId,
    requestedBy: "device-partner",
    status: "pending",
    shared: true,
  });
}

describe("asking the partner to take over", () => {
  it("asks with one touch and then waits for the answer", async () => {
    const { platform, time } = await setup(true);
    const head = headOf(platform, time);
    const item = await head.add({ title: "Dentysta", carrier: "me" });
    show(platform);
    await press(`${request}: Dentysta`);
    await screen.findByText(waiting);
    expect(requestButton("Dentysta")).toBeNull();
    expect(screen.queryByRole("alert")).toBeNull();
    const out = await wireHead(platform).handover.outgoing();
    expect(out.map((v) => v.item.id)).toEqual([item.id]);
  });

  it("asks for a thing of both", async () => {
    const { platform, time } = await setup(true);
    await headOf(platform, time).add({ title: "Oboje", carrier: "both" });
    show(platform);
    await press(`${request}: Oboje`);
    await screen.findByText(waiting);
  });

  it("is offered only for a shared thing that I carry", async () => {
    const { platform, time } = await setup(true);
    const head = headOf(platform, time);
    await head.add({ title: "Prywatna" }, { private: true });
    await head.items.add({ title: "Bez nikogo" });
    await head.add({ title: "Partnera", carrier: "partner" });
    await head.add({ title: "Moja" });
    show(platform);
    await screen.findByText("Moja");
    expect(requestButton("Moja")).toBeTruthy();
    for (const title of ["Prywatna", "Bez nikogo", "Partnera"]) {
      expect(requestButton(title)).toBeNull();
    }
  });

  it("is not offered without a pair", async () => {
    const { platform, time } = await setup(false);
    await headOf(platform, time).add({ title: "Sama" });
    show(platform);
    await screen.findByText("Sama");
    expect(requestButton("Sama")).toBeNull();
  });

  it("goes back to the button when the partner declines, the carrier stays", async () => {
    const { platform, time } = await setup(true);
    const head = headOf(platform, time);
    await head.add({ title: "Dentysta", carrier: "me" });
    show(platform);
    await press(`${request}: Dentysta`);
    await screen.findByText(waiting);
    const [asked] = await wireHead(platform).handover.outgoing();
    time.now += 1000;
    await wireHead(platform).handovers.append({
      requestId: asked?.requestId ?? "",
      itemId: asked?.item.id ?? "",
      requestedBy: "device-me",
      status: "declined",
      shared: true,
    });
    await waitFor(() => {
      expect(requestButton("Dentysta")).toBeTruthy();
    });
    expect(screen.queryByText(waiting)).toBeNull();
    expect(screen.queryByRole("alert")).toBeNull();
    screen.getByLabelText("Dentysta, Inne, Średnia, Ty");
  });
});

describe("requests of the partner", () => {
  it("lists a request with the name of the partner and no second button", async () => {
    const { platform, time } = await setup(true);
    const head = headOf(platform, time);
    const item = await head.add({ title: "Dentysta", carrier: "both" });
    await receiveProfile(platform, "Ola");
    show(platform);
    await screen.findByText("Dentysta");
    expect(screen.queryByText("Ola prosi o przejęcie")).toBeNull();
    time.now += 1000;
    await partnerAsks(platform, item.id);
    await screen.findByText("Ola prosi o przejęcie");
    screen.getByRole("button", {
      name: "Przyjmij prośbę: Dentysta",
    });
    screen.getByRole("button", {
      name: "Odmów prośby: Dentysta",
    });
    expect(
      screen.queryByRole("button", {
        name: `${pl.head.actions.takeOver}: Dentysta`,
      }),
    ).toBeNull();
    expect(requestButton("Dentysta")).toBeNull();
    expect(screen.queryByText(waiting)).toBeNull();
  });

  it("calls the partner 'Partner' without a profile and accepts", async () => {
    const { platform, time } = await setup(true);
    const head = headOf(platform, time);
    const item = await head.add({ title: "Oboje", carrier: "both" });
    await partnerAsks(platform, item.id);
    show(platform);
    await screen.findByText("Partner prosi o przejęcie");
    await press("Przyjmij prośbę: Oboje");
    await waitFor(() => {
      expect(screen.queryByText("Partner prosi o przejęcie")).toBeNull();
    });
    await screen.findByLabelText("Oboje, Inne, Średnia, Ty");
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("declines without a message and the carrier stays", async () => {
    const { platform, time } = await setup(true);
    const head = headOf(platform, time);
    const item = await head.add({ title: "Oboje", carrier: "both" });
    await partnerAsks(platform, item.id);
    show(platform);
    await press("Odmów prośby: Oboje");
    await waitFor(() => {
      expect(screen.queryByText("Partner prosi o przejęcie")).toBeNull();
    });
    expect(screen.queryByRole("alert")).toBeNull();
    screen.getByLabelText("Oboje, Inne, Średnia, Oboje");
  });
});
