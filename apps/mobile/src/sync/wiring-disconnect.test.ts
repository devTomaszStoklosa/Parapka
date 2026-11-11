import { afterEach, expect, it, vi } from "vitest";

import { defaultConsent } from "../consent/consent-model";
import { createDisconnectRepository } from "../pairing/disconnect-repository";
import { CLEANUP_FAILED_MESSAGE, PAIR_GONE_MESSAGE } from "./wiring";
import { profile, setup, start, stoppers } from "./wiring-test-support";

afterEach(() => {
  for (const stop of stoppers.splice(0)) stop();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const quiet = () =>
  vi.spyOn(console, "warn").mockImplementation(() => undefined);

async function started(
  status = 200,
  withCommand = false,
  after: unknown[] = [],
) {
  const devices = await setup(status, withCommand, after);
  await devices.pair();
  await devices.consent.save(defaultConsent(profile));
  start(devices.controller);
  return devices;
}

async function expectCleaned(d: Awaited<ReturnType<typeof started>>) {
  await vi.waitFor(async () => {
    expect(await createDisconnectRepository(d.platform.database).state()).toBe(
      "by-partner",
    );
  });
  expect(await d.pairs.current()).toBeNull();
  expect(await d.pairs.keys()).toBeNull();
  expect(await d.consent.current()).toBeNull();
}

it("stops, cleans up and keeps the state by-partner on pair-gone", async () => {
  const warn = quiet();
  const d = await started(410);
  await expectCleaned(d);
  expect(warn).toHaveBeenCalledWith(PAIR_GONE_MESSAGE);
  const first = d.createSocket.mock.results[0]?.value as { close: () => void };
  expect(first.close).toHaveBeenCalled();
});

it("cleans up after the command disconnect of the partner", async () => {
  const d = await started(200, true);
  await expectCleaned(d);
  expect(await d.platform.database.get("sync-state", "cursor")).toBeNull();
  expect(await d.platform.database.list("sync-applied")).toEqual([]);
});

it("does not apply changes that follow the disconnect command", async () => {
  const later = {
    entity: "Profile",
    id: "current",
    op: "upsert",
    fields: {
      name: { value: "Ala", hlc: "000000000000002-00000-partner" },
      form: { value: "feminine", hlc: "000000000000002-00001-partner" },
    },
  };
  const d = await started(200, true, [later]);
  await expectCleaned(d);
  expect(await d.platform.database.list("partner-profile")).toEqual([]);
});

it("logs a fixed message when the cleanup fails", async () => {
  const warn = quiet();
  const { platform, ...rest } = await setup(410);
  vi.spyOn(platform.keyStore, "delete").mockRejectedValue(new Error("secret"));
  await rest.pair();
  await rest.consent.save(defaultConsent(profile));
  start(rest.controller);
  await vi.waitFor(() => {
    expect(warn).toHaveBeenCalledWith(CLEANUP_FAILED_MESSAGE);
  });
  expect(JSON.stringify(warn.mock.calls)).not.toContain("secret");
});
