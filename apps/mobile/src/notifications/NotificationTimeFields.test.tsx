// @vitest-environment jsdom
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, expect, it, vi } from "vitest";

import { pl } from "../i18n/pl";
import { NotificationTimeFields } from "./NotificationTimeFields";

afterEach(() => {
  cleanup();
  document.body.replaceChildren();
});

// No type declarations are installed for react-dom.
const clientModule: string = "react-dom/client";
const label = pl.notifications.settings.times.quietTo;
const times = { from: "22:00", to: "07:00", hint: "08:00" };
const field = () =>
  screen.getByRole<HTMLInputElement>("textbox", { name: label });
const fields = (value: typeof times) => (
  <NotificationTimeFields times={value} paired={false} onSave={vi.fn()} />
);

it("keeps the text typed right after mounting", async () => {
  // Mounted outside act: the commit lands before the passive effects run.
  const container = document.body.appendChild(document.createElement("div"));
  const appeared = new Promise<void>((resolve) => {
    const observer = new MutationObserver(() => {
      observer.disconnect();
      resolve();
    });
    observer.observe(container, { childList: true, subtree: true });
  });
  const { createRoot } = (await import(/* @vite-ignore */ clientModule)) as {
    createRoot: (el: Element) => { render: (node: ReactNode) => void };
  };
  createRoot(container).render(fields(times));
  await appeared;
  fireEvent.change(field(), { target: { value: "7" } });
  await act(async () => {});
  expect(field().value).toBe("7");
});

it("keeps the typed text when the same times are loaded again", () => {
  const view = render(fields(times));
  fireEvent.change(field(), { target: { value: "7" } });
  view.rerender(fields({ ...times }));
  expect(field().value).toBe("7");
});

it("replaces the typed text when the times change from elsewhere", () => {
  const view = render(fields(times));
  fireEvent.change(field(), { target: { value: "7" } });
  view.rerender(fields({ ...times, to: "06:30" }));
  expect(field().value).toBe("06:30");
});
