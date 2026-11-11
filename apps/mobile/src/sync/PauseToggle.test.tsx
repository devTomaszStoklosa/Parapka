// @vitest-environment jsdom
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
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
