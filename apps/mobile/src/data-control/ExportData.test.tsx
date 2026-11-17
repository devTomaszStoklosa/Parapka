// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";

import { setup, useSodium } from "../chores/planner-test-support";
import { pl } from "../i18n/pl";
import { createMemoryFileShare } from "../platform/file-share";
import { PlatformProvider, type Platform } from "../platform/context";
import { buildExport } from "./export-data";
import { ExportData } from "./ExportData";

useSodium();
afterEach(cleanup);

const texts = pl.data;

async function open(failWith?: Error) {
  const { platform } = await setup(false);
  const fileShare = createMemoryFileShare(failWith);
  const withShare: Platform = { ...platform, fileShare };
  render(
    <PlatformProvider platform={withShare}>
      <ExportData />
    </PlatformProvider>,
  );
  return { platform: withShare, fileShare };
}

const button = () => screen.getByRole("button", { name: texts.export });

it("shares the export as a JSON file with the local date", async () => {
  const { platform, fileShare } = await open();
  fireEvent.click(button());
  await screen.findByText(texts.title);
  await new Promise((resolve) => setTimeout(resolve, 0));
  const expected = JSON.stringify(
    await buildExport({ database: platform.database, clock: platform.clock }),
    null,
    2,
  );
  expect(fileShare.files).toEqual([
    {
      name: "parapka-eksport-2026-11-11.json",
      mimeType: "application/json",
      text: expected,
    },
  ]);
  expect(screen.getByText(texts.warning)).toBeTruthy();
  expect(screen.getByText(texts.excludes)).toBeTruthy();
});

it("disables the button while the file is prepared", async () => {
  const { fileShare } = await open();
  fireEvent.click(button());
  expect(button().hasAttribute("disabled")).toBe(true);
  fireEvent.click(button());
  await new Promise((resolve) => setTimeout(resolve, 0));
  expect(fileShare.files).toHaveLength(1);
  expect(button().hasAttribute("disabled")).toBe(false);
});

it("shows the error when sharing fails", async () => {
  await open(new Error("boom"));
  fireEvent.click(button());
  await screen.findByText(texts.failed);
  expect(button().hasAttribute("disabled")).toBe(false);
});

it("is hidden without a file share", async () => {
  const { platform } = await setup(false);
  render(
    <PlatformProvider platform={platform}>
      <ExportData />
    </PlatformProvider>,
  );
  expect(screen.queryByText(texts.title)).toBeNull();
});

it("keeps the shared texts in the in-memory adapter", async () => {
  const share = createMemoryFileShare();
  await share.shareText("hi");
  expect(share.texts).toEqual(["hi"]);
  const failing = createMemoryFileShare(new Error("boom"));
  await expect(failing.shareText("hi")).rejects.toThrow("boom");
});
