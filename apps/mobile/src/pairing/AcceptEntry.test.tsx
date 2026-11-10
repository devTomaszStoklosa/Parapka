// @vitest-environment jsdom
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

import { createMemoryDatabase } from "../data/memory-database";
import { pl } from "../i18n/pl";
import { PlatformProvider, type Platform } from "../platform/context";
import { createMemoryKeyStore } from "../platform/memory-key-store";
import { webSha256 } from "../platform/sha256";
import { createWebSodium } from "../platform/web-sodium";
import { AcceptEntry } from "./AcceptEntry";

const p = pl.pairing;

const sodium = await createWebSodium();

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

async function flush() {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(0);
  });
}

function openEntry(onDone: () => void) {
  const platform: Platform = {
    sodium,
    keyStore: createMemoryKeyStore(),
    clock: { nowMs: () => 1_000 },
    database: createMemoryDatabase(),
    sha256: webSha256,
    relayUrl: "unused",
    appUrl: "unused",
  };
  return render(
    <PlatformProvider platform={platform}>
      <AcceptEntry text="not an invitation" onDone={onDone} />
    </PlatformProvider>,
  );
}

it("says the pairing is unavailable and closes when the relay is down", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn(() => Promise.reject(new Error("offline"))),
  );
  const onDone = vi.fn();
  openEntry(onDone);
  await flush();
  expect(screen.getByRole("alert").textContent).toBe(p.unavailable);

  fireEvent.click(screen.getByRole("button", { name: p.close }));
  expect(onDone).toHaveBeenCalledOnce();
});

it("retries the wiring and then handles the invitation text", async () => {
  let up = false;
  vi.stubGlobal(
    "fetch",
    vi.fn(() =>
      up
        ? Promise.resolve({
            status: 201,
            text: () => Promise.resolve('{"deviceId":"device-1"}'),
          })
        : Promise.reject(new Error("offline")),
    ),
  );
  openEntry(vi.fn());
  await flush();
  expect(screen.getByRole("alert").textContent).toBe(p.unavailable);

  up = true;
  fireEvent.click(screen.getByRole("button", { name: p.retry }));
  await flush();
  expect(screen.getByRole("alert").textContent).not.toBe(p.unavailable);
});
