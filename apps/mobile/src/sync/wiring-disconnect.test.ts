import { afterEach, expect, it, vi } from "vitest";

import { defaultConsent } from "../consent/consent-model";
import { createIdentity } from "../identity/identity";
import { createDisconnectRepository } from "../pairing/disconnect-repository";
import { CLEANUP_FAILED_MESSAGE, PAIR_GONE_MESSAGE } from "./wiring";
import { backoffMs } from "./sync-scheduler";
import { profile, setup, start, stoppers } from "./wiring-test-support";

afterEach(() => {
  for (const stop of stoppers.splice(0)) stop();
  vi.useRealTimers();
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

interface Relay {
  offline: boolean;
  /** Calls refused while offline. */
  refused: number;
  /** The status for the paths with the mailbox, by its name. */
  statuses: Record<string, number>;
  calls: { method: string; url: string; body: string }[];
}

/** A relay that can go offline and answer per mailbox; replaces the stub of `setup`. */
function relay(statuses: Relay["statuses"] = {}): Relay {
  const state: Relay = { offline: false, refused: 0, statuses, calls: [] };
  vi.stubGlobal(
    "fetch",
    (url: string, init: { method: string; body?: string }) => {
      if (state.offline) {
        state.refused += 1;
        return Promise.reject(new TypeError("offline"));
      }
      const challenge = url.endsWith("/challenges");
      if (!challenge) {
        state.calls.push({ method: init.method, url, body: init.body ?? "" });
      }
      const gone = Object.entries(state.statuses).find(([id]) =>
        url.includes(id),
      );
      return Promise.resolve({
        status: challenge ? 201 : (gone?.[1] ?? 200),
        text: () =>
          Promise.resolve(
            JSON.stringify(
              challenge
                ? { challengeId: "c", nonce: "n" }
                : { envelopes: [], nextCursor: null },
            ),
          ),
      });
    },
  );
  return state;
}

type Devices = Awaited<ReturnType<typeof setup>>;

/** A paired device with the consent, on a relay we control, synchronizing. */
async function online(statuses: Relay["statuses"] = {}) {
  const d = await setup();
  await d.pair();
  await d.consent.save(defaultConsent(profile));
  const r = relay(statuses);
  start(d.controller);
  await vi.waitFor(() => {
    expect(pulls(r, "mailbox-1")).toBeGreaterThan(0);
  });
  r.calls.length = 0;
  return { d, r };
}

const pulls = (r: Relay, mailbox: string) =>
  r.calls.filter((c) => c.method === "GET" && c.url.includes(mailbox)).length;
const closes = (r: Relay, mailbox = "mailbox-1") =>
  r.calls.filter((c) => c.method === "DELETE" && c.url.includes(mailbox));
const sends = (r: Relay, mailbox: string) =>
  r.calls.filter((c) => c.method === "POST" && c.url.includes(mailbox));
const marker = (d: Devices) =>
  d.platform.database.get("pair-closing", "current");

/** Disconnects while the relay is unreachable, on timers we move by hand. */
async function disconnectOffline(d: Devices, r: Relay) {
  r.offline = true;
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
  await d.controller.disconnect();
  await vi.waitFor(() => {
    expect(r.refused).toBeGreaterThanOrEqual(2);
  });
}

it("disconnects online: cleans, sends the command and closes the mailbox", async () => {
  const { d, r } = await online();
  await d.controller.disconnect();
  expect(await d.pairs.current()).toBeNull();
  expect(await d.consent.current()).toBeNull();
  expect(await marker(d)).toBeNull();
  expect(sends(r, "mailbox-1")).toHaveLength(1);
  expect(closes(r)).toHaveLength(1);
  expect(await d.platform.database.list("sync-outbox")).toEqual([]);
});

it("disconnects offline at once and finishes with a growing delay", async () => {
  const { d, r } = await online();
  await disconnectOffline(d, r);
  expect(await d.pairs.current()).toBeNull();
  expect(await marker(d)).toEqual({ pairMailboxId: "mailbox-1" });
  expect(await d.platform.database.list("sync-outbox")).toHaveLength(1);

  const refused = r.refused;
  await vi.advanceTimersByTimeAsync(backoffMs(1));
  await vi.waitFor(() => {
    expect(r.refused).toBeGreaterThan(refused);
  });
  expect(await marker(d)).not.toBeNull();
  r.offline = false;
  await vi.advanceTimersByTimeAsync(backoffMs(2));
  await vi.waitFor(async () => {
    expect(await marker(d)).toBeNull();
  });
  expect(sends(r, "mailbox-1")).toHaveLength(1);
  expect(closes(r)).toHaveLength(1);
});

it("finishes the closing after the start of the app", async () => {
  const { d, r } = await online();
  await disconnectOffline(d, r);
  vi.useRealTimers();
  r.offline = false;
  d.controller.setActive(false);
  d.controller.setActive(true);
  await vi.waitFor(async () => {
    expect(await marker(d)).toBeNull();
  });
  expect(closes(r)).toHaveLength(1);
});

it("keeps the closing for later when the relay cannot be reached", async () => {
  const { d } = await online();
  await createIdentity({
    sodium: d.sodium,
    keyStore: d.platform.keyStore,
    database: d.platform.database,
    relay: () => ({ registerDevice: () => Promise.reject(new Error("no")) }),
  }).clear();
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
  await d.controller.disconnect();
  expect(await marker(d)).not.toBeNull();
});

it("does not carry the envelopes of a closed mailbox to a new pair", async () => {
  const warn = quiet();
  const { d, r } = await online();
  await disconnectOffline(d, r);
  r.statuses["mailbox-1"] = 410;
  vi.useRealTimers();
  const [old] = await d.platform.database.list("sync-outbox");
  expect(old).toBeDefined();

  r.offline = false;
  await d.pair("mailbox-2");
  await d.consent.save(defaultConsent(profile));
  d.controller.setActive(false);
  start(d.controller);
  await vi.waitFor(async () => {
    expect(await marker(d)).toBeNull();
    expect(pulls(r, "mailbox-2")).toBeGreaterThan(0);
  });
  expect(sends(r, "mailbox-2")).toEqual([]);
  expect(await d.platform.database.list("sync-outbox")).toEqual([]);
  expect((await d.pairs.current())?.pairMailboxId).toBe("mailbox-2");
  expect(warn).not.toHaveBeenCalledWith(PAIR_GONE_MESSAGE);
});
