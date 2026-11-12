import type { PairKeys } from "@parapka/crypto";
import { formatHlc } from "@parapka/sync";
import { fireEvent, render, screen } from "@testing-library/react";
import { beforeAll } from "vitest";

import { createMemoryDatabase } from "../data/memory-database";
import { PlatformProvider, type Platform } from "../platform/context";
import { createMemoryKeyStore } from "../platform/memory-key-store";
import { webSha256 } from "../platform/sha256";
import { createWebSodium } from "../platform/web-sodium";
import { createPartnerProfileRepository } from "../sync/partner-profile-repository";
import { wireChores } from "../sync/wiring";
import { PlannerScreen } from "./PlannerScreen";

// Wednesday 2026-11-11, noon.
export const NOW = new Date(2026, 10, 11, 12).getTime();
const KEYS: PairKeys = {
  sendKey: new Uint8Array(32).fill(1),
  receiveKey: new Uint8Array(32).fill(2),
};

let sodium: Platform["sodium"];

/** Call at the top of a test file: loads the cryptography once. */
export function useSodium() {
  beforeAll(async () => {
    sodium = await createWebSodium();
  });
}

/** An in-memory platform, with a confirmed pair when `paired`. */
export async function setup(paired: boolean) {
  // Set `time.now` back to add a chore that is older than the screen's today.
  const time = { now: NOW };
  const platform: Platform = {
    sodium,
    keyStore: createMemoryKeyStore(),
    clock: { nowMs: () => time.now },
    database: createMemoryDatabase(),
    sha256: webSha256,
    relayUrl: "unused",
    appUrl: "unused",
  };
  await platform.database.put("identity", "device", {
    signingPublicKey: "s",
    agreementPublicKey: "a",
    deviceId: "device-me",
  });
  const wired = wireChores(platform);
  if (paired) {
    await wired.pairs.savePending(
      {
        pairMailboxId: "mailbox",
        deviceId: "device-partner",
        signingPublicKey: "s",
        agreementPublicKey: "a",
      },
      KEYS,
    );
    await wired.pairs.confirm();
  }
  return { platform, time, ...wired };
}

export const show = (platform: Platform) =>
  render(
    <PlatformProvider platform={platform}>
      <PlannerScreen />
    </PlatformProvider>,
  );

/** The profile of the partner arrives. */
export async function receiveProfile(platform: Platform, name: string) {
  const hlc = formatHlc({
    physical: 1_800_000_000_000,
    counter: 0,
    deviceId: "device-partner",
  });
  await createPartnerProfileRepository(platform.database).merge({
    name: { value: name, hlc },
    form: { value: "neutral", hlc },
  });
}

export const press = async (name: string, role = "button") => {
  fireEvent.click(await screen.findByRole(role, { name }));
};

export const typeInto = (label: string, value: string) => {
  fireEvent.change(screen.getByLabelText(label), { target: { value } });
};

/** Touches the first row of the chore with the title. */
export const openRow = async (title: string) => {
  const rows = await screen.findAllByRole("button", {
    name: new RegExp(`^${title}, `),
  });
  fireEvent.click(rows[0] as HTMLElement);
};
