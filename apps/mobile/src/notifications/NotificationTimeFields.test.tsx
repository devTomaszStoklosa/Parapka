// @vitest-environment jsdom
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";

import { pl } from "../i18n/pl";
import { NotificationTimeFields } from "./NotificationTimeFields";

afterEach(cleanup);

const label = pl.notifications.settings.times.quietTo;
const times = { from: "22:00", to: "07:00", hint: "08:00" };
const field = () =>
  screen.getByRole<HTMLInputElement>("textbox", { name: label });
const fields = (value: typeof times) => (
  <NotificationTimeFields times={value} paired={false} onSave={vi.fn()} />
);

it("keeps the text typed right after mounting", async () => {
  render(fields(times), { reactStrictMode: false });
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
