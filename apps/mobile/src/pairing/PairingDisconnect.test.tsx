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
import { createPauseRepository } from "../sync/pause-repository";
import { createDisconnectRepository } from "./disconnect-repository";
import { PairingScreen } from "./PairingScreen";

afterEach(cleanup);

function open(options: {
  confirmed: boolean;
  onDisconnect?: () => Promise<void>;
  disconnect?: ReturnType<typeof createDisconnectRepository>;
}) {
  const database = createMemoryDatabase();
  const disconnect = options.disconnect ?? createDisconnectRepository(database);
  const unused = {} as never;
  render(
    <PairingScreen
      inviter={unused}
      acceptor={{ accept: () => unused }}
      pairs={{
        current: () =>
          Promise.resolve(
            options.confirmed ? ({ state: "confirmed" } as never) : null,
          ),
      }}
      consent={{ canSync: () => Promise.resolve(true), save: unused }}
      profiles={{ get: () => Promise.resolve(null) }}
      partner={{
        get: () => Promise.resolve(null),
        subscribe: () => () => undefined,
      }}
      loadSafetyCode={() => Promise.resolve("")}
      disconnect={disconnect}
      onDisconnect={options.onDisconnect ?? (() => Promise.resolve())}
      pause={createPauseRepository(database)}
    />,
  );
  return disconnect;
}

const press = (name: string) => {
  fireEvent.click(screen.getByRole("button", { name }));
};

it("offers the pause and goes back to the invitation after disconnecting", async () => {
  const onDisconnect = vi.fn(() => Promise.resolve());
  open({ confirmed: true, onDisconnect });
  await screen.findByRole("switch", { name: "Pauza" });
  press("Rozłącz");
  press("Rozłącz");
  await screen.findByRole("button", { name: "Zaproś partnera" });
  expect(onDisconnect).toHaveBeenCalledTimes(1);
  expect(screen.getByText("Wklej link zaproszenia")).toBeTruthy();
});

it("tells that the pair was ended when the screen opens", async () => {
  const database = createMemoryDatabase();
  const disconnect = createDisconnectRepository(database);
  await disconnect.markByPartner();
  open({ confirmed: false, disconnect });
  await screen.findByText("Para została rozłączona.");
  press("OK");
  await screen.findByRole("button", { name: "Zaproś partnera" });
  await vi.waitFor(async () => {
    expect(await disconnect.state()).toBe("none");
  });
});

it("tells that the pair was ended while the screen is open", async () => {
  const disconnect = open({ confirmed: true });
  await screen.findByRole("button", { name: "Rozłącz" });
  await act(async () => {
    await disconnect.markByPartner();
  });
  await screen.findByText("Para została rozłączona.");
});

it("survives failing reads and a failing acknowledge", async () => {
  const listeners: (() => void)[] = [];
  const disconnect = {
    state: vi
      .fn()
      .mockResolvedValueOnce("none")
      .mockRejectedValue(new Error("db")),
    acknowledge: () => Promise.reject(new Error("db")),
    subscribe: (listener: () => void) => {
      listeners.push(listener);
      return () => undefined;
    },
  };
  open({ confirmed: false, disconnect: disconnect as never });
  await screen.findByRole("button", { name: "Zaproś partnera" });
  await act(async () => {
    listeners.forEach((listener) => {
      listener();
    });
    await Promise.resolve();
  });
  expect(screen.queryByText("Para została rozłączona.")).toBeNull();
});

it("acknowledges even when saving fails", async () => {
  const disconnect = {
    state: () => Promise.resolve("by-partner"),
    acknowledge: () => Promise.reject(new Error("db")),
    subscribe: () => () => undefined,
  };
  open({ confirmed: false, disconnect: disconnect as never });
  await screen.findByText("Para została rozłączona.");
  press("OK");
  await screen.findByRole("button", { name: "Zaproś partnera" });
});
