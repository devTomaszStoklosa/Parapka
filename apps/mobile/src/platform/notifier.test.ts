import { expect, it } from "vitest";

import { createMemoryNotifier } from "./notifier";

it("keeps what was shown", async () => {
  const notifier = createMemoryNotifier();
  expect(await notifier.show({ title: "a", body: "b", tag: "c" })).toBe(true);
  expect(notifier.shown).toEqual([{ title: "a", body: "b", tag: "c" }]);
});

it("changes the permission to the answer of the user", async () => {
  const notifier = createMemoryNotifier("default", "granted");
  expect(notifier.permission()).toBe("default");
  expect(await notifier.requestPermission()).toBe("granted");
  expect(notifier.permission()).toBe("granted");
});

it("can simulate a notification that was not shown", async () => {
  const notifier = createMemoryNotifier("granted", "granted", false);
  expect(await notifier.show({ title: "a", body: "b", tag: "c" })).toBe(false);
});
