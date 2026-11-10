import { expect, it, vi } from "vitest";

import { createLaunchLinkReader } from "./launch-link";

function setup(pathname: string, hash: string) {
  const replaceState = vi.fn();
  const read = createLaunchLinkReader({ pathname, hash }, { replaceState });
  return { read, replaceState };
}

it("reads the text of /pair#<text> and clears the address bar", () => {
  const { read, replaceState } = setup("/pair", "#abc_DEF-1");
  expect(read()).toBe("abc_DEF-1");
  expect(replaceState).toHaveBeenCalledWith(null, "", "/pair");
});

it("accepts a trailing slash in the path", () => {
  expect(setup("/pair/", "#abc").read()).toBe("abc");
});

it("ignores another path and leaves the address bar alone", () => {
  const { read, replaceState } = setup("/", "#abc");
  expect(read()).toBeNull();
  expect(replaceState).not.toHaveBeenCalled();
});

it("ignores an empty fragment", () => {
  const { read, replaceState } = setup("/pair", "#");
  expect(read()).toBeNull();
  expect(replaceState).not.toHaveBeenCalled();
});

it("returns the same text on a second call and clears only once", () => {
  const { read, replaceState } = setup("/pair", "#abc");
  expect(read()).toBe("abc");
  expect(read()).toBe("abc");
  expect(replaceState).toHaveBeenCalledTimes(1);
});
