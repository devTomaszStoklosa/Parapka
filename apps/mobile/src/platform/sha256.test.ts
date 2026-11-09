import { expect, it } from "vitest";
import { webSha256 } from "./sha256";

const hex = (bytes: Uint8Array) =>
  Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");

it("hashes the empty input", async () => {
  expect(hex(await webSha256(new Uint8Array()))).toBe(
    "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
  );
});

it("hashes abc", async () => {
  expect(hex(await webSha256(new TextEncoder().encode("abc")))).toBe(
    "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
  );
});
