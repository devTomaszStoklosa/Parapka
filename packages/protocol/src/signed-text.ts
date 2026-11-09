/** Starts every signed text, so a request signature cannot be mistaken for another signature of the same key. */
export const AUTH_CONTEXT_PREFIX = "parapka-relay-auth-v1\n";

export interface SignedTextParts {
  readonly method: string;
  /** Path with the query, as the relay sees it. */
  readonly url: string;
  readonly challengeId: string;
  readonly nonce: string;
  /** SHA-256 of the request body, lower-case hex. */
  readonly bodyHashHex: string;
}

/** The text a device signs: prefix, method, path, challenge and body hash (spec 7.4). */
export function buildSignedText(parts: SignedTextParts): string {
  return (
    AUTH_CONTEXT_PREFIX +
    [
      parts.method,
      parts.url,
      parts.challengeId,
      parts.nonce,
      parts.bodyHashHex,
    ].join("\n")
  );
}
