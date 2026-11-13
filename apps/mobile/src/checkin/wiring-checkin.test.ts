import { sealCheckin } from "@parapka/crypto";
import { afterEach, expect, it, vi } from "vitest";

import { defaultConsent } from "../consent/consent-model";
import {
  profile,
  setup,
  start,
  stoppers,
  tick,
} from "../sync/wiring-test-support";
import { base64Encode } from "../sync/base64";
import { createWebSodium } from "../platform/web-sodium";
import { wireCheckin } from "./wiring";

afterEach(() => {
  for (const stop of stoppers.splice(0)) stop();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

it("shares one repository per platform", async () => {
  const { platform } = await setup();
  expect(wireCheckin(platform)).toBe(wireCheckin(platform));
  expect(wireCheckin(platform).checkin).toBeDefined();
});

it("synchronizes after each change of the schedule", async () => {
  const set = await setup();
  await set.consent.save(defaultConsent(profile));
  await set.pair();
  start(set.controller);
  await vi.waitFor(() => {
    expect(set.syncs()).toBeGreaterThan(0);
  });
  await tick();
  const before = set.syncs();
  await wireCheckin(set.platform).schedule.set({
    weekday: 3,
    hour: 19,
    minute: 0,
  });
  await vi.waitFor(
    () => {
      expect(set.syncs()).toBeGreaterThan(before);
    },
    { timeout: 3000 },
  );
});

it("registers the handler of the sealed check-ins in the engine", async () => {
  const sodium = await createWebSodium();
  const fields = {
    checkinId: "2026-W45:partner",
    authorId: "partner",
    version: 1,
  };
  const { sealed } = sealCheckin(sodium, fields, new Uint8Array([1, 2, 3]));
  const hlc = "000000000000001-00000-partner";
  const field = (value: unknown) => ({ value, hlc });
  const change = {
    entity: "CheckIn",
    id: "2026-W45:partner|1",
    op: "upsert",
    fields: {
      ...Object.fromEntries(
        Object.entries(fields).map(([name, value]) => [name, field(value)]),
      ),
      week: field("2026-W45"),
      nonce: field(base64Encode(sealed.nonce)),
      ciphertext: field(base64Encode(sealed.ciphertext)),
    },
  };
  const set = await setup(200, false, [], [change]);
  await set.consent.save({ ...defaultConsent(profile), CHECKIN: true });
  await set.pair();
  start(set.controller);
  await vi.waitFor(
    async () => {
      expect(
        await wireCheckin(set.platform).sealed.partnerFilled("2026-W45"),
      ).toBe(true);
    },
    { timeout: 4000 },
  );
});
