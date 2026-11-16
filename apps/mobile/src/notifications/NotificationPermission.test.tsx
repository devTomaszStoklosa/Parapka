// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";

import { pl } from "../i18n/pl";
import { createMemoryNotifier } from "../platform/notifier";
import { NotificationPermission } from "./NotificationPermission";

afterEach(cleanup);

const texts = pl.notifications.settings.permission;
const enable = () => screen.queryByRole("button", { name: texts.enable });

it("asks for the consent from the press and shows the answer", async () => {
  const notifier = createMemoryNotifier("default", "granted");
  const request = vi.spyOn(notifier, "requestPermission");
  render(<NotificationPermission notifier={notifier} />);
  expect(screen.getByText(texts.openTabOnly)).toBeTruthy();
  fireEvent.click(enable() as HTMLElement);
  // Synchronous: no await between the press and the call.
  expect(request).toHaveBeenCalledTimes(1);
  await screen.findByText(texts.granted);
  expect(enable()).toBeNull();
});

it("explains how to change a refusal", async () => {
  const notifier = createMemoryNotifier("default", "denied");
  render(<NotificationPermission notifier={notifier} />);
  fireEvent.click(enable() as HTMLElement);
  await screen.findByText(texts.denied);
  expect(enable()).toBeNull();
});

it("reads the state again when the request fails", async () => {
  const notifier = createMemoryNotifier("default");
  const request = vi
    .spyOn(notifier, "requestPermission")
    .mockRejectedValue(new Error("x"));
  render(<NotificationPermission notifier={notifier} />);
  fireEvent.click(enable() as HTMLElement);
  await vi.waitFor(() => {
    expect(request).toHaveBeenCalled();
  });
  expect(enable()).not.toBeNull();
});

it.each([
  ["granted", texts.granted],
  ["denied", texts.denied],
  ["unsupported", texts.unsupported],
] as const)("shows only text for %s", (state, text) => {
  render(<NotificationPermission notifier={createMemoryNotifier(state)} />);
  expect(screen.getByText(text)).toBeTruthy();
  expect(enable()).toBeNull();
});

it("treats a missing notifier as unsupported", () => {
  render(<NotificationPermission />);
  expect(screen.getByText(texts.unsupported)).toBeTruthy();
  expect(enable()).toBeNull();
});
