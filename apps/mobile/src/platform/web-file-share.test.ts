// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";

import { createWebFileShare } from "./web-file-share";

const file = { name: "a.json", mimeType: "application/json", text: "{}" };

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

function stubNavigator(nav: object) {
  vi.stubGlobal("navigator", nav);
}

function stubDownload() {
  const created = vi.fn(() => "blob:x");
  const revoked = vi.fn();
  vi.stubGlobal("URL", { createObjectURL: created, revokeObjectURL: revoked });
  const clicked: HTMLAnchorElement[] = [];
  vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (
    this: HTMLAnchorElement,
  ) {
    clicked.push(this);
    expect(revoked).not.toHaveBeenCalled();
  });
  return { created, revoked, clicked };
}

it("shares the file when the browser accepts files", async () => {
  const share = vi.fn(() => Promise.resolve());
  stubNavigator({ canShare: () => true, share });
  await createWebFileShare().shareFile(file);
  expect(share).toHaveBeenCalledWith({
    files: [expect.objectContaining({ name: "a.json" })],
  });
});

it("does not treat a cancelled share as an error", async () => {
  const abort = Object.assign(new Error("x"), { name: "AbortError" });
  stubNavigator({ canShare: () => true, share: () => Promise.reject(abort) });
  await createWebFileShare().shareFile(file);
});

it("rejects on any other share error", async () => {
  stubNavigator({
    canShare: () => true,
    share: () => Promise.reject(new Error("boom")),
  });
  await expect(createWebFileShare().shareFile(file)).rejects.toThrow("boom");
});

it("downloads the file when files cannot be shared", async () => {
  const share = vi.fn(() => Promise.resolve());
  stubNavigator({ canShare: () => false, share });
  const { created, revoked, clicked } = stubDownload();
  await createWebFileShare().shareFile(file);
  expect(share).not.toHaveBeenCalled();
  expect(created).toHaveBeenCalledWith(expect.any(Blob));
  expect(clicked).toHaveLength(1);
  expect(clicked[0]?.download).toBe("a.json");
  expect(clicked[0]?.href).toBe("blob:x");
  expect(revoked).toHaveBeenCalledWith("blob:x");
});

it("downloads the file without the share API", async () => {
  stubNavigator({});
  const { clicked } = stubDownload();
  await createWebFileShare().shareFile(file);
  expect(clicked).toHaveLength(1);
});

it("shares a text, and downloads it without the share API", async () => {
  const share = vi.fn(() => Promise.resolve());
  stubNavigator({ share });
  await createWebFileShare().shareText("hi");
  expect(share).toHaveBeenCalledWith({ text: "hi" });
  const abort = Object.assign(new Error("x"), { name: "AbortError" });
  stubNavigator({ share: () => Promise.reject(abort) });
  await createWebFileShare().shareText("hi");
  stubNavigator({});
  const { clicked } = stubDownload();
  await createWebFileShare().shareText("hi");
  expect(clicked[0]?.download).toBe("parapka.txt");
});

it("calls canShare and share on the navigator itself", async () => {
  const nav = {
    canShare(this: unknown) {
      if (this !== nav) throw new TypeError("Illegal invocation");
      return true;
    },
    share(this: unknown) {
      if (this !== nav) throw new TypeError("Illegal invocation");
      return Promise.resolve();
    },
  };
  stubNavigator(nav);
  await createWebFileShare().shareFile(file);
  await createWebFileShare().shareText("hi");
});
