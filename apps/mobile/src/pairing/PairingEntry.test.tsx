// @vitest-environment jsdom
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import { encodeDevicePublicKeys, generateDeviceKeys } from "@parapka/crypto";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

import { createMemoryDatabase } from "../data/memory-database";
import { pl } from "../i18n/pl";
import { PlatformProvider, type Platform } from "../platform/context";
import { createMemoryKeyStore } from "../platform/memory-key-store";
import { webSha256 } from "../platform/sha256";
import { createWebSodium } from "../platform/web-sodium";
import { createPairRepository } from "./pair-repository";
import { PairingEntry } from "./PairingEntry";

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

function memoryPlatform(): Platform {
  return {
    sodium,
    keyStore: createMemoryKeyStore(),
    clock: { nowMs: () => 1_000 },
    database: createMemoryDatabase(),
    sha256: webSha256,
    relayUrl: "unused",
    appUrl: "unused",
  };
}

function openEntry(platform: Platform) {
  return render(
    <PlatformProvider platform={platform}>
      <PairingEntry />
    </PlatformProvider>,
  );
}

it("says the pairing is unavailable while the device is not registered", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn(() => Promise.reject(new Error("offline"))),
  );
  openEntry(memoryPlatform());
  await flush();
  expect(screen.getByRole("alert").textContent).toBe(p.unavailable);
});

it("builds the real dependencies and returns to the safety code", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn(() =>
      Promise.resolve({
        status: 201,
        text: () => Promise.resolve('{"deviceId":"device-1"}'),
      }),
    ),
  );
  const platform = memoryPlatform();
  const first = openEntry(platform);
  await flush();
  expect(screen.getByRole("button", { name: p.invite })).toBeTruthy();
  first.unmount();

  const peerKeys = generateDeviceKeys(sodium);
  const peer = encodeDevicePublicKeys({
    signing: peerKeys.signing.publicKey,
    agreement: peerKeys.agreement.publicKey,
  });
  await createPairRepository(platform.database, platform.keyStore).savePending(
    {
      pairMailboxId: "mailbox",
      deviceId: "device-2",
      signingPublicKey: peer.signing,
      agreementPublicKey: peer.agreement,
    },
    { sendKey: new Uint8Array(32), receiveKey: new Uint8Array(32) },
  );
  openEntry(platform);
  await flush();
  expect(screen.getByText(/^\d{6}$/)).toBeTruthy();
});

it("says the pairing is unavailable when the relay answers 500", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn(() =>
      Promise.resolve({ status: 500, text: () => Promise.resolve("{}") }),
    ),
  );
  openEntry(memoryPlatform());
  await flush();
  expect(screen.getByRole("alert").textContent).toBe(p.unavailable);
});

it("retries the wiring and works without a reload once the relay answers", async () => {
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
  openEntry(memoryPlatform());
  await flush();
  expect(screen.getByRole("alert").textContent).toBe(p.unavailable);

  up = true;
  fireEvent.click(screen.getByRole("button", { name: p.retry }));
  await flush();
  expect(screen.getByRole("button", { name: p.invite })).toBeTruthy();
  expect(screen.queryByRole("alert")).toBeNull();
});
