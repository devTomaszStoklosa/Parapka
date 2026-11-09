import { expect, it } from "vitest";
import { buildInvitationLink, qrMatrix } from "./invitation-link";

it("puts the invitation text in the fragment", () => {
  expect(buildInvitationLink("https://app.example", "v1.a.b.c.d")).toBe(
    "https://app.example/pair#v1.a.b.c.d",
  );
  expect(buildInvitationLink("https://app.example/", "v1.x")).toBe(
    "https://app.example/pair#v1.x",
  );
  const url = new URL(buildInvitationLink("https://app.example", "v1.x"));
  expect(url.search).toBe("");
  expect(url.hash).toBe("#v1.x");
});

it("computes a square matrix with finder patterns", () => {
  const matrix = qrMatrix("https://app.example/pair#v1.abc");
  expect(matrix.length).toBeGreaterThanOrEqual(21);
  expect(matrix.every((row) => row.length === matrix.length)).toBe(true);
  // The top left finder pattern: a dark frame, a light ring, a dark centre.
  expect(matrix[0]?.slice(0, 7)).toEqual(Array(7).fill(true));
  expect(matrix[1]?.[1]).toBe(false);
  expect(matrix[3]?.[3]).toBe(true);
});

it("is deterministic and depends on the text", () => {
  expect(qrMatrix("a")).toEqual(qrMatrix("a"));
  expect(qrMatrix("a")).not.toEqual(qrMatrix("b"));
});
