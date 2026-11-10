// @vitest-environment jsdom
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi, type Mock } from "vitest";

import { pl } from "../i18n/pl";
import { InviteScreen, POLL_INTERVAL_MS } from "./InviteScreen";
import type { Acceptor, AcceptResult } from "./acceptor";
import type { CreateResult, Inviter, PollResult } from "./inviter";
import type { Pair } from "./pair-repository";
import { PairingScreen } from "./PairingScreen";
import { qrMatrix } from "./invitation-link";

const p = pl.pairing;
const LINK = "https://parapka.example/pair#abc";
const EXPIRES_AT = Date.UTC(2026, 10, 9, 12, 30);

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

const ACCEPTED: PollResult = { status: "accepted", safetyCode: "042042" };

const created: CreateResult = {
  status: "created",
  link: LINK,
  invitationId: "inv",
  expiresAt: EXPIRES_AT,
};

type FakeInviter = { [K in keyof Inviter]: Mock<Inviter[K]> };

function fakeInviter(
  create: CreateResult = created,
  ...polls: PollResult[]
): FakeInviter {
  const queue = [...polls];
  return {
    create: vi.fn(() => Promise.resolve(create)),
    poll: vi.fn(() => Promise.resolve(queue.shift() ?? { status: "waiting" })),
    confirm: vi.fn(() => Promise.resolve()),
    reject: vi.fn(() => Promise.resolve()),
  };
}

const fakeAcceptor = (r: AcceptResult): Mock<Acceptor["accept"]> =>
  vi.fn(() => Promise.resolve(r));

function pair(state: Pair["state"]): Pair {
  return {
    pairMailboxId: "mailbox",
    deviceId: "device",
    signingPublicKey: "s",
    agreementPublicKey: "a",
    state,
  };
}

const save = vi.fn(() => Promise.resolve());
async function open(
  inviter: FakeInviter,
  stored: Pair | null = null,
  loadSafetyCode = () => Promise.resolve("123456"),
  accept = fakeAcceptor({ status: "accepted", safetyCode: "042042" }),
) {
  render(
    <PairingScreen
      inviter={inviter}
      acceptor={{ accept }}
      pairs={{ current: () => Promise.resolve(stored) }}
      consent={{ canSync: () => Promise.resolve(true), save }}
      profiles={{ get: () => Promise.resolve(null) }}
      partner={{ get: () => Promise.resolve(null) }}
      loadSafetyCode={loadSafetyCode}
    />,
  );
  await flush();
}

const renderInvite = (inviter: FakeInviter) =>
  render(
    <InviteScreen inviter={inviter} onAccepted={vi.fn()} onCancel={vi.fn()} />,
  );

/** Lets resolved promises run, and the timers move on by `ms`. */
async function flush(ms = 0) {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
}

const click = async (name: string) => {
  fireEvent.click(screen.getByRole("button", { name }));
  await flush();
};

it("offers an invitation when there is no pair", async () => {
  await open(fakeInviter());
  expect(screen.getByRole("button", { name: p.invite })).toBeTruthy();
});

it("shows the QR code, expiry, copy button and the waiting note", async () => {
  const inviter = fakeInviter();
  await open(inviter);
  await click(p.invite);

  const qr = screen.getByRole("img", { name: p.invitation.qrLabel });
  expect(qr.children).toHaveLength(qrMatrix(LINK).length);
  const time = new Date(EXPIRES_AT).toLocaleTimeString("pl-PL", {
    hour: "2-digit",
    minute: "2-digit",
  });
  expect(
    screen.getByText(p.invitation.expires.replace("{time}", time)),
  ).toBeTruthy();
  expect(screen.getByText(p.invitation.waiting)).toBeTruthy();
  expect(screen.getByRole("button", { name: p.invitation.copy })).toBeTruthy();
});

it("copies the link", async () => {
  const writeText = vi.fn(() => Promise.resolve());
  vi.stubGlobal("navigator", { clipboard: { writeText } });
  await open(fakeInviter());
  await click(p.invite);
  await click(p.invitation.copy);
  expect(writeText).toHaveBeenCalledWith(LINK);
  expect(screen.getByText(p.invitation.copied)).toBeTruthy();
});

it("says when the link cannot be copied", async () => {
  vi.stubGlobal("navigator", {});
  await open(fakeInviter());
  await click(p.invite);
  await click(p.invitation.copy);
  expect(screen.getByText(p.invitation.copyFailed)).toBeTruthy();
});

it("polls every few seconds while the screen is open and stops on unmount", async () => {
  const inviter = fakeInviter();
  const view = renderInvite(inviter);
  await flush();
  expect(inviter.poll).not.toHaveBeenCalled();
  await flush(POLL_INTERVAL_MS);
  expect(inviter.poll).toHaveBeenCalledTimes(1);
  await flush(POLL_INTERVAL_MS);
  expect(inviter.poll).toHaveBeenCalledTimes(2);
  view.unmount();
  await flush(POLL_INTERVAL_MS * 3);
  expect(inviter.poll).toHaveBeenCalledTimes(2);
});

it("does not start another poll while the previous one runs", async () => {
  const inviter = fakeInviter();
  inviter.poll.mockReturnValue(new Promise(() => undefined));
  renderInvite(inviter);
  await flush();
  await flush(POLL_INTERVAL_MS * 3);
  expect(inviter.poll).toHaveBeenCalledTimes(1);
});

it("returns to the start when the invitation is cancelled", async () => {
  await open(fakeInviter());
  await click(p.invite);
  await click(p.cancel);
  expect(screen.getByRole("button", { name: p.invite })).toBeTruthy();
});

it("confirms the safety code and shows the pair", async () => {
  const inviter = fakeInviter(created, ACCEPTED);
  await open(inviter);
  await click(p.invite);
  await flush(POLL_INTERVAL_MS);

  expect(screen.getByText("042042")).toBeTruthy();
  expect(screen.getByText(p.safety.instruction)).toBeTruthy();
  await click(p.safety.same);
  expect(inviter.confirm).toHaveBeenCalledOnce();
  await click(pl.consent.save);
  expect(save).toHaveBeenCalledOnce();
  expect(screen.getByText(p.paired)).toBeTruthy();
});

it("rejects the pair when the codes differ", async () => {
  const inviter = fakeInviter(created, ACCEPTED);
  await open(inviter);
  await click(p.invite);
  await flush(POLL_INTERVAL_MS);
  await click(p.safety.different);

  expect(inviter.reject).toHaveBeenCalledOnce();
  expect(screen.getByText(p.rejected)).toBeTruthy();
  expect(screen.getByRole("button", { name: p.invite })).toBeTruthy();
});

it("returns to the safety code of a pair waiting for confirmation", async () => {
  await open(fakeInviter(), pair("pending-confirmation"));
  expect(screen.getByText("123456")).toBeTruthy();
  expect(screen.queryByRole("button", { name: p.invite })).toBeNull();
});

it("shows that the people are paired", async () => {
  await open(fakeInviter(), pair("confirmed"));
  expect(screen.getByText(p.paired)).toBeTruthy();
  expect(screen.queryByRole("button", { name: p.invite })).toBeNull();
});

it("asks to leave the current pair first", async () => {
  await open(fakeInviter({ status: "already-paired" }));
  await click(p.invite);
  expect(screen.getByText(p.errors.alreadyPaired)).toBeTruthy();
  expect(screen.queryByRole("button", { name: p.newInvite })).toBeNull();
});

it("says when the relay cannot be reached and allows a retry", async () => {
  const inviter = fakeInviter({ status: "offline" });
  await open(inviter);
  await click(p.invite);
  expect(screen.getByText(p.errors.offline)).toBeTruthy();
  inviter.create.mockResolvedValue(created);
  await click(p.newInvite);
  expect(screen.getByRole("img", { name: p.invitation.qrLabel })).toBeTruthy();
});

it("offers a new invitation when the old one expired", async () => {
  const inviter = fakeInviter(created, { status: "expired" });
  await open(inviter);
  await click(p.invite);
  await flush(POLL_INTERVAL_MS);
  expect(screen.getByText(p.errors.expired)).toBeTruthy();
  expect(screen.queryByRole("img")).toBeNull();

  await click(p.newInvite);
  expect(inviter.create).toHaveBeenCalledTimes(2);
  expect(screen.getByRole("img", { name: p.invitation.qrLabel })).toBeTruthy();
});

it("reports an invalid answer of the partner", async () => {
  await open(fakeInviter(created, { status: "invalid" }));
  await click(p.invite);
  await flush(POLL_INTERVAL_MS);
  expect(screen.getByText(p.errors.invalid)).toBeTruthy();
  expect(screen.getByRole("button", { name: p.newInvite })).toBeTruthy();
});

it("keeps waiting after a lost connection and clears the note", async () => {
  await open(fakeInviter(created, { status: "offline" }));
  await click(p.invite);
  await flush(POLL_INTERVAL_MS);
  expect(screen.getByText(p.errors.offline)).toBeTruthy();
  expect(screen.getByText(p.invitation.waiting)).toBeTruthy();
  await flush(POLL_INTERVAL_MS);
  expect(screen.queryByText(p.errors.offline)).toBeNull();
});

it("shows a message and a retry when the relay call throws", async () => {
  const inviter = fakeInviter();
  inviter.create.mockRejectedValueOnce(new Error("server"));
  inviter.poll.mockRejectedValueOnce(new Error("server"));
  await open(inviter);
  await click(p.invite);
  expect(screen.getByText(p.errors.offline)).toBeTruthy();
  await click(p.newInvite);
  await flush(POLL_INTERVAL_MS);
  expect(screen.getByText(p.errors.offline)).toBeTruthy();
  expect(screen.queryByRole("img")).toBeNull();
});

it("says the pairing is unavailable when the stored pair cannot be read", async () => {
  await open(fakeInviter(), pair("pending-confirmation"), () =>
    Promise.reject(new Error("broken")),
  );
  expect(screen.getByRole("alert").textContent).toBe(p.unavailable);
});

it("says so when confirming or rejecting the pair fails", async () => {
  const inviter = fakeInviter(created, ACCEPTED);
  inviter.confirm.mockRejectedValueOnce(new Error("429"));
  inviter.reject.mockRejectedValueOnce(new Error("500"));
  await open(inviter);
  await click(p.invite);
  await flush(POLL_INTERVAL_MS);
  await click(p.safety.same);
  expect(screen.getByRole("alert").textContent).toBe(p.unavailable);
  await click(p.safety.different);
  expect(screen.getByRole("alert").textContent).toBe(p.unavailable);
});

const paste = async (text: string) => {
  fireEvent.change(screen.getByLabelText(p.paste.label), {
    target: { value: text },
  });
  await click(p.paste.connect);
};

it("accepts a pasted link and shows the safety code", async () => {
  const accept = fakeAcceptor({ status: "accepted", safetyCode: "042042" });
  const inviter = fakeInviter();
  await open(inviter, null, undefined, accept);
  await paste("  /pair#abc ");
  expect(accept).toHaveBeenCalledWith("/pair#abc");
  expect(screen.getByText("042042")).toBeTruthy();
  await click(p.safety.same);
  expect(inviter.confirm).toHaveBeenCalledOnce();
});

it("keeps Connect disabled while the field is empty", async () => {
  await open(fakeInviter());
  const connect = screen.getByRole("button", { name: p.paste.connect });
  expect(connect.getAttribute("aria-disabled")).toBe("true");
});

it.each([
  [{ status: "invalid" }, p.errors.invalidInvitation],
  [{ status: "already-paired" }, p.errors.alreadyPaired],
  [{ status: "expired" }, p.errors.expired],
  [{ status: "inviter-paired" }, p.errors.inviterPaired],
  [{ status: "offline" }, p.errors.offline],
] as const)(
  "shows a message for the pasted link result %j",
  async (result, message) => {
    await open(fakeInviter(), null, undefined, fakeAcceptor(result));
    await paste("abc");
    expect(screen.getByRole("alert").textContent).toBe(message);
    expect(screen.queryByText("042042")).toBeNull();
  },
);

it("says the pairing is unavailable when accepting throws", async () => {
  const accept = vi.fn(() => Promise.reject(new Error("bug")));
  await open(fakeInviter(), null, undefined, accept);
  await paste("abc");
  expect(screen.getByRole("alert").textContent).toBe(p.unavailable);
});
