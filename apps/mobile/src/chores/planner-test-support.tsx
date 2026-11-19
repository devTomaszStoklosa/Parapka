import type { PairKeys } from "@parapka/crypto";
import { formatHlc } from "@parapka/sync";
import { act, fireEvent, render, screen } from "@testing-library/react";
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

/** The name of an action button: its label, then the title and the date. */
export const action = (label: string) => new RegExp(`^${label}: `);

/**
 * Runs the pending passive effects. Promises of the repositories settle
 * outside `act`, so after a `findBy…` the effects may still be queued, and an
 * event would reach handlers that are not yet configured.
 */
export const settle = () => act(async () => {});

export const press = async (name: string | RegExp, role = "button") => {
  await screen.findByRole(role, { name });
  await settle();
  fireEvent.click(screen.getByRole(role, { name }));
};

export const typeInto = (label: string, value: string) => {
  fireEvent.change(screen.getByLabelText(label), { target: { value } });
};

/** Touches the first row of the chore with the title. */
export const openRow = async (title: string) => {
  const name = new RegExp(`^${title}, `);
  await screen.findAllByRole("button", { name });
  await settle();
  fireEvent.click(screen.getAllByRole("button", { name })[0] as HTMLElement);
};
