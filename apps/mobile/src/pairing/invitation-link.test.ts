import { describe, expect, it } from "vitest";

import {
  invitationLink,
  parseInvitationLink,
  qrMatrix,
} from "./invitation-link";

describe("invitation link", () => {
  it("puts the text in the fragment", () => {
    expect(invitationLink("https://app.example", "v1.a.b.c.d")).toBe(
      "https://app.example/pair#v1.a.b.c.d",
    );
  });

  it("does not double the slash", () => {
    expect(invitationLink("https://app.example/", "v1.x")).toBe(
      "https://app.example/pair#v1.x",
    );
  });

  it("parses its own link", () => {
    const link = invitationLink("https://app.example", "v1.a.b.c.d");
    expect(parseInvitationLink(link)).toBe("v1.a.b.c.d");
  });

  it("returns null for other links", () => {
    expect(parseInvitationLink("https://app.example/other#x")).toBeNull();
    expect(parseInvitationLink("https://app.example/pair")).toBeNull();
    expect(parseInvitationLink("https://app.example/pair#")).toBeNull();
    expect(parseInvitationLink("/pair#x")).toBeNull();
  });
});

describe("qrMatrix", () => {
  it("returns a square boolean matrix with dark modules", () => {
    const matrix = qrMatrix("https://app.example/pair#v1.a.b.c.d");
    expect(matrix.length).toBeGreaterThanOrEqual(21);
    for (const row of matrix) expect(row).toHaveLength(matrix.length);
    expect(matrix.flat().some(Boolean)).toBe(true);
    expect(matrix.flat().some((module) => !module)).toBe(true);
  });
});
