// @vitest-environment jsdom
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";

import { setup, useSodium } from "../chores/planner-test-support";
import { defaultConsent, NO_PROFILE } from "../consent/consent-model";
import { wireConsent } from "../consent/wiring";
import { wireHead } from "../head/wiring";
import { PlatformProvider, type Platform } from "../platform/context";
import { SharePrivateGate } from "./SharePrivateGate";
import { wireSharePrivate } from "./wiring";

useSodium();
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const chore = {
  title: "Podlać kwiaty",
  rule: { kind: "daily" },
  assignment: { kind: "anyone" },
} as const;

const show = (platform: Platform) =>
  render(
    <PlatformProvider platform={platform}>
      <SharePrivateGate>
        <p>aplikacja</p>
      </SharePrivateGate>
    </PlatformProvider>,
  );

/** A paired device with consent, one private chore and one private thing. */
async function ready() {
  const set = await setup(true);
  await wireConsent(set.platform).consent.save(defaultConsent(NO_PROFILE));
  await set.chores.add(chore, { private: true });
  await wireHead(set.platform).items.add(
    { title: "Umówić wizytę" },
    { private: true },
  );
  return set;
}

const press = (name: string) => {
  fireEvent.click(screen.getByRole("button", { name }));
};

it("asks with nothing picked, then moves only what is picked", async () => {
  const { platform, chores } = await ready();
  show(platform);
  const row = await screen.findByRole("checkbox", { name: "Podlać kwiaty" });
  expect(row.getAttribute("aria-checked")).toBe("false");
  expect(
    screen.getByRole("checkbox", { name: "Umówić wizytę" }).getAttribute(
      "aria-checked",
    ),
  ).toBe("false");
  fireEvent.click(row);
  expect(row.getAttribute("aria-checked")).toBe("true");
  fireEvent.click(row);
  expect(row.getAttribute("aria-checked")).toBe("false");
  fireEvent.click(row);
  press("Przenieś wybrane");
  await screen.findByText("aplikacja");
  expect(await chores.list()).toMatchObject([{ shared: true }]);
  expect(await wireHead(platform).items.list()).toMatchObject([{ shared: false }]);
});

it("keeps everything private after Skip and does not ask again", async () => {
  const { platform, chores } = await ready();
  const view = show(platform);
  await screen.findByText("Co przenieść do wspólnych?");
  press("Pomiń");
  await screen.findByText("aplikacja");
  expect(await chores.list()).toMatchObject([{ shared: false }]);
  view.unmount();
  show(platform);
  await waitFor(() => {
    expect(screen.getByText("aplikacja")).toBeTruthy();
  });
  expect(screen.queryByText("Co przenieść do wspólnych?")).toBeNull();
});

it("does not ask without a pair, a consent or private records", async () => {
  const single = await setup(false);
  await wireConsent(single.platform).consent.save(defaultConsent(NO_PROFILE));
  await single.chores.add(chore);
  show(single.platform);
  await screen.findByText("aplikacja");
  cleanup();
  const unconsented = await setup(true);
  await unconsented.chores.add(chore, { private: true });
  show(unconsented.platform);
  await screen.findByText("aplikacja");
  cleanup();
  const empty = await setup(true);
  await wireConsent(empty.platform).consent.save(defaultConsent(NO_PROFILE));
  show(empty.platform);
  await screen.findByText("aplikacja");
  expect(screen.queryByText("Co przenieść do wspólnych?")).toBeNull();
});

it("asks once the consent is saved after the pair", async () => {
  const { platform, chores } = await setup(true);
  await chores.add(chore, { private: true });
  show(platform);
  await screen.findByText("aplikacja");
  await wireConsent(platform).consent.save(defaultConsent(NO_PROFILE));
  await screen.findByText("Co przenieść do wspólnych?");
});

it("asks once the pair is confirmed after the consent", async () => {
  const { platform, chores, pairs } = await setup(true);
  await wireConsent(platform).consent.save(defaultConsent(NO_PROFILE));
  await chores.add(chore, { private: true });
  await pairs.remove();
  show(platform);
  await screen.findByText("aplikacja");
  await pairs.savePending(
    {
      pairMailboxId: "mailbox",
      deviceId: "device-partner",
      signingPublicKey: "s",
      agreementPublicKey: "a",
    },
    { sendKey: new Uint8Array(32), receiveKey: new Uint8Array(32) },
  );
  await pairs.confirm();
  await screen.findByText("Co przenieść do wspólnych?");
});

it("shows the app when the check cannot be read", async () => {
  const { platform } = await setup(true);
  vi.spyOn(wireSharePrivate(platform), "candidates").mockRejectedValue(
    new Error("boom"),
  );
  show(platform);
  await screen.findByText("aplikacja");
});

it("tells when the choice could not be saved and keeps the question", async () => {
  const { platform } = await ready();
  vi.spyOn(wireSharePrivate(platform), "skip").mockRejectedValue(
    new Error("boom"),
  );
  vi.spyOn(wireSharePrivate(platform), "share").mockRejectedValue(
    new Error("boom"),
  );
  show(platform);
  await screen.findByText("Co przenieść do wspólnych?");
  press("Pomiń");
  await screen.findByRole("alert");
  press("Przenieś wybrane");
  await screen.findByRole("alert");
  expect(screen.queryByText("aplikacja")).toBeNull();
});
