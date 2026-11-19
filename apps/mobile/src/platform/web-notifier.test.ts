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

const message = { title: "a", body: "b", tag: "c" };

function stubThrowingNotification() {
  const Fake = Object.assign(
    function Fake() {
      throw new TypeError("Illegal constructor");
    },
    { permission: "granted", requestPermission: () => Promise.resolve("granted") },
  );
  vi.stubGlobal("Notification", Fake);
}

it("is unsupported without the Notification API", async () => {
  vi.stubGlobal("Notification", undefined);
  const notifier = createWebNotifier();
  expect(notifier.permission()).toBe("unsupported");
  expect(await notifier.requestPermission()).toBe("unsupported");
  expect(await notifier.show(message)).toBe(false);
});

it("shows nothing when the browser denied it", async () => {
  const created = stubNotification("denied");
  const getRegistration = vi.fn();
  vi.stubGlobal("navigator", { serviceWorker: { getRegistration } });
  const notifier = createWebNotifier();
  expect(notifier.permission()).toBe("denied");
  expect(await notifier.show(message)).toBe(false);
  expect(created).toEqual([]);
  expect(getRegistration).not.toHaveBeenCalled();
});

it("shows a notification when the browser allowed it", async () => {
  const created = stubNotification("granted");
  const getRegistration = vi.fn();
  vi.stubGlobal("navigator", { serviceWorker: { getRegistration } });
  expect(await createWebNotifier().show(message)).toBe(true);
  expect(created).toEqual([["a", { body: "b", tag: "c" }]]);
  expect(getRegistration).not.toHaveBeenCalled();
});

it("falls back to the service worker when the constructor throws", async () => {
  stubThrowingNotification();
  const showNotification = vi.fn(() => Promise.resolve());
  vi.stubGlobal("navigator", {
    serviceWorker: {
      getRegistration: () => Promise.resolve({ showNotification }),
    },
  });
  expect(await createWebNotifier().show(message)).toBe(true);
  expect(showNotification).toHaveBeenCalledTimes(1);
  expect(showNotification).toHaveBeenCalledWith("a", { body: "b", tag: "c" });
});

it("reports false when the constructor throws and there is no service worker", async () => {
  stubThrowingNotification();
  vi.stubGlobal("navigator", {});
  expect(await createWebNotifier().show(message)).toBe(false);
});

it("reports false when the constructor throws and there is no registration", async () => {
  stubThrowingNotification();
  vi.stubGlobal("navigator", {
    serviceWorker: { getRegistration: () => Promise.resolve(undefined) },
  });
  expect(await createWebNotifier().show(message)).toBe(false);
});

it("reports false when the service worker refuses to show it", async () => {
  stubThrowingNotification();
  vi.stubGlobal("navigator", {
    serviceWorker: {
      getRegistration: () =>
        Promise.resolve({
          showNotification: () => Promise.reject(new Error("no")),
        }),
    },
  });
  expect(await createWebNotifier().show(message)).toBe(false);
});

it("asks the browser for the permission", async () => {
  stubNotification("default", "denied");
  expect(await createWebNotifier().requestPermission()).toBe("denied");
});
