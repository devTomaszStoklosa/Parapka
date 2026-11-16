import { afterEach, expect, it, vi } from "vitest";

import { createWebNotifier } from "./web-notifier";

afterEach(() => {
  vi.unstubAllGlobals();
});

function stubNotification(permission: string, answer = "granted") {
  const created: unknown[][] = [];
  const Fake = Object.assign(
    function Fake(...args: unknown[]) {
      created.push(args);
    },
    { permission, requestPermission: () => Promise.resolve(answer) },
  );
  vi.stubGlobal("Notification", Fake);
  return created;
}

it("is unsupported without the Notification API", async () => {
  vi.stubGlobal("Notification", undefined);
  const notifier = createWebNotifier();
  expect(notifier.permission()).toBe("unsupported");
  expect(await notifier.requestPermission()).toBe("unsupported");
  notifier.show({ title: "a", body: "b", tag: "c" });
});

it("shows nothing when the browser denied it", () => {
  const created = stubNotification("denied");
  const notifier = createWebNotifier();
  expect(notifier.permission()).toBe("denied");
  notifier.show({ title: "a", body: "b", tag: "c" });
  expect(created).toEqual([]);
});

it("shows a notification when the browser allowed it", () => {
  const created = stubNotification("granted");
  createWebNotifier().show({ title: "a", body: "b", tag: "c" });
  expect(created).toEqual([["a", { body: "b", tag: "c" }]]);
});

it("asks the browser for the permission", async () => {
  stubNotification("default", "denied");
  expect(await createWebNotifier().requestPermission()).toBe("denied");
});
