// @vitest-environment jsdom
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";

import { setup, useSodium } from "../chores/planner-test-support";
import { pl } from "../i18n/pl";
import { createMemoryFileShare } from "../platform/file-share";
import { PlatformProvider, type Platform } from "../platform/context";
import { deleteAllData } from "./delete-all";
import { DeleteAllData } from "./DeleteAllData";
import { RestartProvider } from "./restart";

vi.mock("./delete-all", () => ({ deleteAllData: vi.fn() }));
const pairs = { activePair: vi.fn() };
vi.mock("./wiring", () => ({
  wireDeleteAll: (_platform: unknown, options: object = {}) => ({
    ...options,
    pairs,
  }),
}));

useSodium();
afterEach(() => {
  cleanup();
  vi.mocked(deleteAllData).mockReset();
  pairs.activePair.mockReset();
});

const texts = pl.data.deleteAll;
const mocked = vi.mocked(deleteAllData);

async function open(
  options: { fileShareError?: Error; noShare?: boolean } = {},
) {
  const { platform } = await setup(false);
  const fileShare = createMemoryFileShare(options.fileShareError);
  const withShare: Platform = options.noShare
    ? platform
    : { ...platform, fileShare };
  const restart = vi.fn();
  render(
    <PlatformProvider platform={withShare}>
      <RestartProvider value={restart}>
        <DeleteAllData />
      </RestartProvider>
    </PlatformProvider>,
  );
  return { restart, fileShare };
}

const click = (name: string) => {
  fireEvent.click(screen.getByRole("button", { name }));
};
const toConfirm = () => {
  click(texts.open);
  click(texts.next);
};
const flush = () => new Promise((resolve) => setTimeout(resolve, 0));
const isDisabled = (name: string) =>
  screen.getByRole("button", { name }).hasAttribute("disabled");

it("deletes nothing on cancel in either step", async () => {
  const { restart } = await open();
  click(texts.open);
  click(texts.cancel);
  toConfirm();
  expect(screen.getByText(texts.confirmText)).toBeTruthy();
  click(texts.cancel);
  expect(screen.getByRole("button", { name: texts.open })).toBeTruthy();
  expect(mocked).not.toHaveBeenCalled();
  expect(restart).not.toHaveBeenCalled();
});

it("says what is lost and what stays with the partner", async () => {
  await open();
  click(texts.open);
  for (const key of [
    "pair",
    "relay",
    "device",
    "partner",
    "exportHint",
  ] as const) {
    expect(screen.getByText(texts[key])).toBeTruthy();
  }
  expect(mocked).not.toHaveBeenCalled();
});

it("deletes after the second confirmation and restarts the app", async () => {
  mocked.mockResolvedValue("done");
  const { restart } = await open();
  toConfirm();
  click(texts.confirm);
  await waitFor(() => {
    expect(restart).toHaveBeenCalledTimes(1);
  });
  expect(mocked).toHaveBeenCalledWith(
    expect.objectContaining({ localOnly: false }),
  );
});

it("shows the busy state and disables the buttons while deleting", async () => {
  mocked.mockReturnValue(new Promise<"done">(() => undefined));
  await open();
  toConfirm();
  click(texts.confirm);
  expect(screen.getByText(texts.deleting)).toBeTruthy();
  expect(isDisabled(texts.confirm)).toBe(true);
  expect(isDisabled(texts.cancel)).toBe(true);
});

it("offers a retry and a local-only deletion when offline", async () => {
  mocked.mockResolvedValueOnce("offline");
  const { restart } = await open();
  toConfirm();
  click(texts.confirm);
  await screen.findByText(texts.offline);
  expect(screen.getByText(texts.localOnlyHint)).toBeTruthy();
  expect(restart).not.toHaveBeenCalled();

  mocked.mockResolvedValueOnce("offline");
  click(texts.retry);
  await screen.findByText(texts.offline);

  mocked.mockResolvedValueOnce("done");
  click(texts.localOnly);
  await waitFor(() => {
    expect(restart).toHaveBeenCalledTimes(1);
  });
  expect(mocked).toHaveBeenLastCalledWith(
    expect.objectContaining({ localOnly: true }),
  );
});

it("shows an error and re-enables the buttons when deleting fails", async () => {
  mocked.mockRejectedValueOnce(new Error("boom"));
  const { restart } = await open();
  toConfirm();
  click(texts.confirm);
  await screen.findByText(pl.data.failed);
  expect(isDisabled(texts.confirm)).toBe(false);
  expect(restart).not.toHaveBeenCalled();
});

it("exports the data before deleting", async () => {
  const { fileShare } = await open();
  click(texts.open);
  click(texts.exportFirst);
  await flush();
  expect(fileShare.files).toHaveLength(1);
  expect(mocked).not.toHaveBeenCalled();
});

it("shows an error when the export fails", async () => {
  await open({ fileShareError: new Error("boom") });
  click(texts.open);
  click(texts.exportFirst);
  await screen.findByText(pl.data.failed);
});

it("hides the export button without a file share", async () => {
  await open({ noShare: true });
  click(texts.open);
  expect(screen.queryByRole("button", { name: texts.exportFirst })).toBeNull();
});

it("does not say nothing was deleted when the pair ended before offline", async () => {
  pairs.activePair.mockResolvedValueOnce({}).mockResolvedValueOnce(null);
  mocked.mockResolvedValueOnce("offline");
  await open();
  toConfirm();
  click(texts.confirm);
  await screen.findByText(texts.offlinePairEnded);
  expect(screen.queryByText(texts.localOnlyHint)).toBeNull();
  expect(screen.getByText(texts.localOnlyHintEnded)).toBeTruthy();
});
