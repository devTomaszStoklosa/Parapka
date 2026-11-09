// @vitest-environment jsdom
import {
  base64urlEncode,
  decodeInvitation,
  encryptAcceptorKeys,
  generateDeviceKeys,
} from "@parapka/crypto";
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
import { RelayError } from "../net/relay-error";
import { createIdentity } from "../identity/identity";
import { PlatformProvider, type Platform } from "../platform/context";
import { createMemoryKeyStore } from "../platform/memory-key-store";
import { webSha256 } from "../platform/sha256";
import { createWebSodium } from "../platform/web-sodium";
import { POLL_INTERVAL_MS } from "./InviteScreen";
import { createPairRepository } from "./pair-repository";
import { PairingScreen } from "./PairingScreen";
import { QrView, runsOfRow } from "./QrView";

const NOW = Date.UTC(2030, 0, 1);

/** What the fake relay answers; `keys` is set once the partner accepted. */
interface FakeRelay {
  keys: string | null;
  /** Thrown by every call when set. */
  failure: Error | null;
  /** Calls the screen made, like "createInvitation". */
  requests: string[];
}

const fake = vi.hoisted(() => ({
  relay: null as unknown as FakeRelay,
  now: 0,
  count: 0,
}));

// jsdom has its own Uint8Array, which libsodium rejects when signing; the relay
// client itself is tested in net/relay-client.test.ts.
vi.mock("../net/relay-client", async () => {
  const { RelayError } = await import("../net/relay-error");
  const call = (name: string) => {
    fake.relay.requests.push(name);
    if (fake.relay.failure) return Promise.reject(fake.relay.failure);
    return Promise.resolve();
  };
  return {
    createRelayClient: () => ({
      createInvitation: () =>
        call("createInvitation").then(() => ({
          invitationId: `inv${String((fake.count += 1))}`,
          expiresAt: new Date(fake.now + 24 * 3600 * 1000).toISOString(),
        })),
      fetchInvitationKeys: () =>
        call("fetchInvitationKeys").then(() => {
          if (fake.relay.keys === null) throw new RelayError("notFound", 404);
          return {
            encryptedKeys: fake.relay.keys,
            acceptedByDeviceId: "device-b",
            pairMailboxId: "mailbox",
          };
        }),
    }),
  };
});

let relay: FakeRelay;
let platform: Platform;
let copied: string[];

beforeEach(async () => {
  relay = { keys: null, failure: null, requests: [] };
  fake.relay = relay;
  fake.now = NOW;
  copied = [];
  vi.stubGlobal("navigator", {
    clipboard: {
      writeText: (text: string) => {
        copied.push(text);
        return Promise.resolve();
      },
    },
  });
  const sodium = await createWebSodium();
  const keyStore = createMemoryKeyStore();
  const database = createMemoryDatabase();
  await createIdentity({
    sodium,
    keyStore,
    database,
    relay: () => ({
      registerDevice: () => Promise.resolve({ deviceId: "device-a" }),
    }),
  }).init();
  platform = {
    sodium,
    keyStore,
    clock: { nowMs: () => NOW },
    database,
    sha256: webSha256,
    relayUrl: "http://relay",
    appUrl: "https://app.example",
  };
  relay.requests = [];
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

const renderScreen = () =>
  render(
    <PlatformProvider platform={platform}>
      <PairingScreen />
    </PlatformProvider>,
  );

const click = async (label: string) => {
  const target = await screen.findByText(label);
  await act(() => {
    fireEvent.click(target);
    return Promise.resolve();
  });
};

/** The partner accepts: B seals its keys with the secret from the link. */
function accept(link: string) {
  const keys = generateDeviceKeys(platform.sodium);
  const invitation = decodeInvitation(new URL(link).hash.slice(1));
  const sealed = encryptAcceptorKeys(
    platform.sodium,
    invitation.secret,
    invitation.invitationId,
    { signing: keys.signing.publicKey, agreement: keys.agreement.publicKey },
  );
  relay.keys = `${base64urlEncode(sealed.nonce)}.${base64urlEncode(sealed.ciphertext)}`;
}

const poll = () =>
  act(async () => {
    await vi.advanceTimersByTimeAsync(POLL_INTERVAL_MS);
  });

async function inviteAndAccept() {
  vi.useFakeTimers({ toFake: ["setInterval", "clearInterval"] });
  renderScreen();
  await click(pl.pairing.invite);
  await screen.findByLabelText(pl.pairing.invitation.qrLabel);
  await click(pl.pairing.invitation.copy);
  const link = copied[0] ?? "";
  accept(link);
  await poll();
  await screen.findByText(pl.pairing.safety.title);
}

it("shows the QR code, the validity and copies the link", async () => {
  renderScreen();
  await click(pl.pairing.invite);
  expect(
    await screen.findByLabelText(pl.pairing.invitation.qrLabel),
  ).toBeTruthy();
  expect(screen.getByText(/^Ważne do /)).toBeTruthy();
  await click(pl.pairing.invitation.copy);
  expect(copied[0]).toMatch(/^https:\/\/app\.example\/pair#v1\.inv\d+\./);
  expect(await screen.findByText(pl.pairing.invitation.copied)).toBeTruthy();
});

it("polls only while the screen is open", async () => {
  vi.useFakeTimers({ toFake: ["setInterval", "clearInterval"] });
  const { unmount } = renderScreen();
  await click(pl.pairing.invite);
  await screen.findByLabelText(pl.pairing.invitation.qrLabel);
  await poll();
  const polls = () =>
    relay.requests.filter((r) => r === "fetchInvitationKeys").length;
  expect(polls()).toBe(1);
  unmount();
  await poll();
  expect(polls()).toBe(1);
});

it("shows the safety code after the partner accepts and confirms the pair", async () => {
  await inviteAndAccept();
  const code = screen.getByText(/^\d{6}$/).textContent;
  expect(code).toMatch(/^\d{6}$/);
  const pairs = createPairRepository(platform.database, platform.keyStore);
  expect(await pairs.active()).toBeNull();
  await click(pl.pairing.safety.same);
  expect((await pairs.active())?.record.pairMailboxId).toBe("mailbox");
  expect(await screen.findByText(pl.pairing.paired)).toBeTruthy();
});

it("rejects the pair and removes its keys when the codes differ", async () => {
  await inviteAndAccept();
  await click(pl.pairing.safety.different);
  expect(await screen.findByText(pl.pairing.rejected)).toBeTruthy();
  const pairs = createPairRepository(platform.database, platform.keyStore);
  expect(await pairs.get()).toBeNull();
  expect(await platform.keyStore.get("pair/send-key")).toBeNull();
  expect(await platform.keyStore.get("pair/receive-key")).toBeNull();
});

it("returns to the safety code after a restart while the pair is pending", async () => {
  await inviteAndAccept();
  cleanup();
  renderScreen();
  expect(await screen.findByText(pl.pairing.safety.title)).toBeTruthy();
});

it("does not ask the relay when the person is already in a pair", async () => {
  await createPairRepository(platform.database, platform.keyStore).savePending(
    {
      pairMailboxId: "m",
      partnerDeviceId: "d",
      partnerSigningPublicKey: "s",
      partnerAgreementPublicKey: "a",
    },
    { sendKey: Uint8Array.of(1), receiveKey: Uint8Array.of(2) },
  );
  await createPairRepository(platform.database, platform.keyStore).confirm();
  renderScreen();
  await click(pl.pairing.invite);
  expect(await screen.findByText(pl.pairing.alreadyPaired)).toBeTruthy();
  expect(relay.requests).toEqual([]);
});

it("offers a new invitation when the old one expired", async () => {
  vi.useFakeTimers({ toFake: ["setInterval", "clearInterval"] });
  renderScreen();
  await click(pl.pairing.invite);
  await screen.findByLabelText(pl.pairing.invitation.qrLabel);
  relay.failure = new RelayError("expired", 410);
  await poll();
  expect(await screen.findByText(pl.pairing.invitation.expired)).toBeTruthy();
  relay.failure = null;
  await click(pl.pairing.invitation.renew);
  expect(
    await screen.findByLabelText(pl.pairing.invitation.qrLabel),
  ).toBeTruthy();
});

it("closes the invitation and shows a message when the relay fails", async () => {
  relay.failure = new RelayError("network");
  renderScreen();
  await click(pl.pairing.invite);
  expect(await screen.findByText(pl.pairing.offline)).toBeTruthy();
  relay.failure = new RelayError("server", 500);
  await click(pl.pairing.invite);
  expect(await screen.findByText(pl.pairing.error)).toBeTruthy();
});

it("closes the waiting screen", async () => {
  renderScreen();
  await click(pl.pairing.invite);
  await click(pl.pairing.invitation.cancel);
  expect(await screen.findByText(pl.pairing.invite)).toBeTruthy();
});

it("merges neighbouring modules of one colour", () => {
  expect(runsOfRow([true, true, false, true])).toEqual([
    { dark: true, length: 2 },
    { dark: false, length: 1 },
    { dark: true, length: 1 },
  ]);
  expect(runsOfRow([])).toEqual([]);
});

it("draws the matrix with a quiet zone and a label", () => {
  render(
    <QrView
      matrix={[
        [true, false],
        [false, true],
      ]}
      accessibilityLabel="qr"
    />,
  );
  const image = screen.getByLabelText("qr");
  // 2 rows plus 4 rows of quiet zone on each side.
  expect(image.children).toHaveLength(10);
});
