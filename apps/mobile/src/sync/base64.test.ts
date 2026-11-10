import { describe, expect, it } from "vitest";

import { base64Decode, base64Encode } from "./base64";

describe("base64", () => {
  it.each([
    [[], ""],
    [[102], "Zg=="],
    [[102, 111], "Zm8="],
    [[102, 111, 111], "Zm9v"],
    [[251, 255, 190], "+/++"],
  ])("converts %j both ways", (bytes, text) => {
    expect(base64Encode(Uint8Array.from(bytes))).toBe(text);
    expect([...base64Decode(text)]).toEqual(bytes);
  });

  it.each(["Zg", "Zm9v!", "Zg=a", "Zh==", "Zm9=", "-_-_"])(
    "rejects %j",
    (text) => {
      expect(() => base64Decode(text)).toThrow();
    },
  );
});
