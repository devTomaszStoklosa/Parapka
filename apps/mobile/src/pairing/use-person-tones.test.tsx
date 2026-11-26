// @vitest-environment jsdom
import { base64urlEncode, type PairKeys } from "@parapka/crypto";
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeAll, expect, it, vi } from "vitest";

import { createMemoryDatabase } from "../data/memory-database";
import type { Platform } from "../platform/context";
import { createMemoryKeyStore } from "../platform/memory-key-store";
import { webSha256 } from "../platform/sha256";
import { createWebSodium } from "../platform/web-sodium";
import { wireChores } from "../sync/wiring";
import { personTones } from "./person-tone";
import { usePersonTones } from "./use-person-tones";

const KEYS: PairKeys = {
  sendKey: new Uint8Array(32).fill(1),
  receiveKey: new Uint8Array(32).fill(2),
};
const OWN = new Uint8Array(32).fill(7);
const OWN_TEXT = base64urlEncode(OWN);
const DEFAULTS = { own: "personA", partner: "personB" };

let sodium: Platform["sodium"];

beforeAll(async () => {
  sodium = await createWebSodium();
});

afterEach(cleanup);

async function setup(withIdentity = true) {
  const platform: Platform = {
    sodium,
    keyStore: createMemoryKeyStore(),
    clock: { nowMs: () => 0 },
    database: createMemoryDatabase(),
    sha256: webSha256,
    relayUrl: "unused",
    appUrl: "unused",
  };
  if (withIdentity) {
    await platform.database.put("identity", "device", {
      signingPublicKey: OWN_TEXT,
      agreementPublicKey: OWN_TEXT,
      deviceId: "device-me",
    });
  }
  const { pairs } = wireChores(platform);
  const pair = async (signingPublicKey: string) => {
    await pairs.savePending(
      {
        pairMailboxId: "mailbox",
        deviceId: "device-partner",
        signingPublicKey,
        agreementPublicKey: "a",
      },
      KEYS,
    );
    await pairs.confirm();
  };
  return { platform, pairs, pair };
}

it("gives the defaults without a pair", async () => {
  const { platform } = await setup();
  const { result } = renderHook(() => usePersonTones(platform));
  await act(async () => {});
  expect(result.current).toEqual(DEFAULTS);
});

it("gives the defaults without an identity", async () => {
  const { platform, pair } = await setup(false);
  await pair("partner-key");
  const { result } = renderHook(() => usePersonTones(platform));
  await act(async () => {});
  expect(result.current).toEqual(DEFAULTS);
});

it("gives the tones of the keys with a pair", async () => {
  const { platform, pair } = await setup();
  await pair("0000");
  const { result } = renderHook(() => usePersonTones(platform));
  await waitFor(() => {
    expect(result.current).toEqual(personTones(OWN_TEXT, "0000"));
  });
  expect(result.current.own).toBe("personB");
});

it("goes back to the defaults when the pair is removed", async () => {
  const { platform, pair, pairs } = await setup();
  await pair("0000");
  const { result } = renderHook(() => usePersonTones(platform));
  await waitFor(() => {
    expect(result.current.own).toBe("personB");
  });
  await act(async () => {
    await pairs.remove();
  });
  await waitFor(() => {
    expect(result.current).toEqual(DEFAULTS);
  });
});

it("gives the defaults when reading fails", async () => {
  const { platform, pairs } = await setup();
  vi.spyOn(platform.database, "get").mockRejectedValue(new Error("boom"));
  const { result } = renderHook(() => usePersonTones(platform));
  await act(async () => {});
  expect(result.current).toEqual(DEFAULTS);
  expect(pairs).toBeTruthy();
});

it("ignores a read that finishes after the unmount", async () => {
  const { platform } = await setup();
  const { unmount } = renderHook(() => usePersonTones(platform));
  unmount();
  await act(async () => {});
});
