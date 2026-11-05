import { describe, expect, it } from "vitest";
import { base64urlDecode, base64urlEncode } from "./base64url.js";

const text = (value: string) =>
  Uint8Array.from(value, (char) => char.charCodeAt(0));

describe("base64url", () => {
  it("matches RFC 4648 vectors without padding", () => {
    expect(base64urlEncode(text(""))).toBe("");
    expect(base64urlEncode(text("f"))).toBe("Zg");
    expect(base64urlEncode(text("fo"))).toBe("Zm8");
    expect(base64urlEncode(text("foo"))).toBe("Zm9v");
    expect(base64urlEncode(text("foobar"))).toBe("Zm9vYmFy");
    expect(base64urlEncode(Uint8Array.from([0xfb, 0xff]))).toBe("-_8");
  });

  it("round-trips all lengths", () => {
    for (let n = 0; n < 40; n++) {
      const bytes = Uint8Array.from(
        { length: n },
        (_, i) => (i * 37 + 250) % 256,
      );
      expect(base64urlDecode(base64urlEncode(bytes))).toEqual(bytes);
    }
  });

  it("rejects bad text", () => {
    expect(() => base64urlDecode("Zg==")).toThrow();
    expect(() => base64urlDecode("Zm+v")).toThrow();
    expect(() => base64urlDecode("Zm/v")).toThrow();
    expect(() => base64urlDecode("Z")).toThrow();
    expect(() => base64urlDecode("Zh")).toThrow();
    expect(() => base64urlDecode("Zm 9")).toThrow();
  });
});
