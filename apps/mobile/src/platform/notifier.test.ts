import { expect, it } from "vitest";

import { createMemoryNotifier } from "./notifier";

it("keeps what was shown", () => {
  const notifier = createMemoryNotifier();
  notifier.show({ title: "a", body: "b", tag: "c" });
  expect(notifier.shown).toEqual([{ title: "a", body: "b", tag: "c" }]);
});

it("changes the permission to the answer of the user", async () => {
  const notifier = createMemoryNotifier("default", "granted");
  expect(notifier.permission()).toBe("default");
  expect(await notifier.requestPermission()).toBe("granted");
  expect(notifier.permission()).toBe("granted");
});
