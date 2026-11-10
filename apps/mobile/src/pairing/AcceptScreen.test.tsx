// @vitest-environment jsdom
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";

import { pl } from "../i18n/pl";
import type { Acceptor, AcceptResult } from "./acceptor";
import { AcceptScreen } from "./AcceptScreen";

const p = pl.pairing;

afterEach(cleanup);

function fakeAcceptor(accept: Acceptor["accept"]) {
  return {
    accept: vi.fn(accept),
    confirm: vi.fn(() => Promise.resolve()),
    reject: vi.fn(() => Promise.resolve()),
  };
}

async function open(acceptor: Acceptor, onDone = vi.fn()) {
  await act(async () => {
    render(<AcceptScreen acceptor={acceptor} text="abc" onDone={onDone} />);
    await Promise.resolve();
  });
  return onDone;
}

const click = async (name: string) => {
  await act(async () => {
    fireEvent.click(screen.getByRole("button", { name }));
    await Promise.resolve();
  });
};

const accepted: AcceptResult = { status: "accepted", safetyCode: "042042" };

it("accepts the text and shows the safety code, then confirms", async () => {
  const acceptor = fakeAcceptor(() => Promise.resolve(accepted));
  const onDone = await open(acceptor);
  expect(acceptor.accept).toHaveBeenCalledWith("abc");
  expect(screen.getByText("042042")).toBeTruthy();
  await click(p.safety.same);
  expect(acceptor.confirm).toHaveBeenCalledOnce();
  expect(onDone).toHaveBeenCalledOnce();
});

it("rejects the pair when the codes differ", async () => {
  const acceptor = fakeAcceptor(() => Promise.resolve(accepted));
  const onDone = await open(acceptor);
  await click(p.safety.different);
  expect(acceptor.reject).toHaveBeenCalledOnce();
  expect(onDone).toHaveBeenCalledOnce();
});

it.each([
  [{ status: "invalid" }, p.errors.invalidInvitation],
  [{ status: "already-paired" }, p.errors.alreadyPaired],
  [{ status: "expired" }, p.errors.expired],
  [{ status: "inviter-paired" }, p.errors.inviterPaired],
  [{ status: "offline" }, p.errors.offline],
] as const)(
  "shows a message for the result %j and closes",
  async (result, message) => {
    const onDone = await open(fakeAcceptor(() => Promise.resolve(result)));
    expect(screen.getByRole("alert").textContent).toBe(message);
    await click(p.close);
    expect(onDone).toHaveBeenCalledOnce();
  },
);

it("says the pairing is unavailable when accepting throws", async () => {
  await open(fakeAcceptor(() => Promise.reject(new Error("bug"))));
  expect(screen.getByRole("alert").textContent).toBe(p.unavailable);
});
