import { expect, it } from "vitest";
import { AUTH_CONTEXT_PREFIX, buildSignedText } from "./signed-text.js";

it("builds the text from a fixed vector", () => {
  const text = buildSignedText({
    method: "POST",
    url: "/v1/invitations",
    challengeId: "chal",
    nonce: "nonce",
    bodyHashHex: "ab12",
  });
  expect(text).toBe(
    "parapka-relay-auth-v1\nPOST\n/v1/invitations\nchal\nnonce\nab12",
  );
});

it("starts with the versioned prefix and a newline", () => {
  expect(AUTH_CONTEXT_PREFIX).toBe("parapka-relay-auth-v1\n");
});
