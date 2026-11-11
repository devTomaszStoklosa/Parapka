// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";

import { DisconnectControl } from "./DisconnectControl";

afterEach(cleanup);

const press = (name: string) => {
  fireEvent.click(screen.getByRole("button", { name }));
};

it("asks first, then disconnects and reports it", async () => {
  const onDisconnect = vi.fn(() => Promise.resolve());
  const onDone = vi.fn();
  render(<DisconnectControl onDisconnect={onDisconnect} onDone={onDone} />);
  press("Rozłącz");
  expect(onDisconnect).not.toHaveBeenCalled();
  expect(screen.getByText(/Partner straci Twoje dane/)).toBeTruthy();
  press("Rozłącz");
  await vi.waitFor(() => {
    expect(onDone).toHaveBeenCalled();
  });
  expect(onDisconnect).toHaveBeenCalledTimes(1);
});

it("goes back on cancel without disconnecting", () => {
  const onDisconnect = vi.fn(() => Promise.resolve());
  render(<DisconnectControl onDisconnect={onDisconnect} onDone={vi.fn()} />);
  press("Rozłącz");
  press("Anuluj");
  expect(onDisconnect).not.toHaveBeenCalled();
  expect(screen.getByRole("button", { name: "Rozłącz" })).toBeTruthy();
});

it("shows a message when disconnecting fails", async () => {
  const onDone = vi.fn();
  render(
    <DisconnectControl
      onDisconnect={() => Promise.reject(new Error("offline"))}
      onDone={onDone}
    />,
  );
  press("Rozłącz");
  press("Rozłącz");
  await screen.findByText("Nie udało się rozłączyć. Spróbuj jeszcze raz.");
  expect(onDone).not.toHaveBeenCalled();
  press("Anuluj");
  press("Rozłącz");
  expect(screen.queryByRole("alert")).toBeNull();
});
