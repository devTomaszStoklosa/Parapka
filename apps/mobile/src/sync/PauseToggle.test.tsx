// @vitest-environment jsdom
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";

import { createMemoryDatabase } from "../data/memory-database";
import { PauseToggle } from "./PauseToggle";
import { createPauseRepository } from "./pause-repository";

afterEach(cleanup);

it("shows the stored pause and saves a change", async () => {
  const pause = createPauseRepository(createMemoryDatabase());
  await pause.setPaused(true);
  render(<PauseToggle pause={pause} />);
  const toggle = await screen.findByRole("switch", { name: "Pauza" });
  await vi.waitFor(() => {
    expect((toggle as HTMLInputElement).checked).toBe(true);
  });
  expect(screen.getByText(/nie dostanie powiadomienia/)).toBeTruthy();
  fireEvent.click(toggle);
  await vi.waitFor(async () => {
    expect(await pause.isPaused()).toBe(false);
  });
});

it("follows a change made elsewhere", async () => {
  const pause = createPauseRepository(createMemoryDatabase());
  render(<PauseToggle pause={pause} />);
  const toggle = await screen.findByRole("switch", { name: "Pauza" });
  await act(async () => {
    await pause.setPaused(true);
  });
  expect((toggle as HTMLInputElement).checked).toBe(true);
});

it("shows a message when the save fails and ignores a failed read", async () => {
  const pause = {
    isPaused: () => Promise.reject(new Error("db")),
    setPaused: () => Promise.reject(new Error("db")),
    subscribe: () => () => undefined,
  };
  render(<PauseToggle pause={pause} />);
  fireEvent.click(await screen.findByRole("switch", { name: "Pauza" }));
  await screen.findByText("Nie udało się zmienić pauzy. Spróbuj jeszcze raz.");
});

it("switches by pressing the label or the hint and back", async () => {
  const pause = createPauseRepository(createMemoryDatabase());
  render(<PauseToggle pause={pause} />);
  await screen.findByRole("switch", { name: "Pauza" });
  expect(screen.getAllByRole("switch", { name: "Pauza" })).toHaveLength(1);
  expect(screen.queryByRole("button", { name: "Pauza" })).toBeNull();
  fireEvent.click(screen.getByText("Pauza"));
  await vi.waitFor(async () => {
    expect(await pause.isPaused()).toBe(true);
  });
  await waitFor(() => {
    expect(
      screen.getByRole<HTMLInputElement>("switch", { name: "Pauza" }).checked,
    ).toBe(true);
  });
  fireEvent.click(screen.getByText("Pauza"));
  await vi.waitFor(async () => {
    expect(await pause.isPaused()).toBe(false);
  });
  await waitFor(() => {
    expect(
      screen.getByRole<HTMLInputElement>("switch", { name: "Pauza" }).checked,
    ).toBe(false);
  });
  fireEvent.click(screen.getByText(/nie dostanie powiadomienia/));
  await vi.waitFor(async () => {
    expect(await pause.isPaused()).toBe(true);
  });
});
