const ALPHABET =
  "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";

/** Base64url without padding (RFC 4648 §5). */
export function base64urlEncode(bytes: Uint8Array): string {
  let out = "";
  for (let i = 0; i < bytes.length; i += 3) {
    const b0 = bytes[i] as number;
    const b1 = bytes[i + 1];
    const b2 = bytes[i + 2];
    out += ALPHABET.charAt(b0 >> 2);
    out += ALPHABET.charAt(((b0 & 3) << 4) | ((b1 ?? 0) >> 4));
    if (b1 !== undefined) {
      out += ALPHABET.charAt(((b1 & 15) << 2) | ((b2 ?? 0) >> 6));
    }
    if (b2 !== undefined) {
      out += ALPHABET.charAt(b2 & 63);
    }
  }
  return out;
}

/** Strict decoder: throws on a character outside the alphabet, on padding and on a non-canonical tail. */
export function base64urlDecode(text: string): Uint8Array {
  if (text.length % 4 === 1) {
    throw new Error("Invalid base64url length");
  }
  const values: number[] = [];
  for (const char of text) {
    const value = ALPHABET.indexOf(char);
    if (value < 0) {
      throw new Error("Invalid base64url character");
    }
    values.push(value);
  }
  const out: number[] = [];
  for (let i = 0; i < values.length; i += 4) {
    const v0 = values[i] as number;
    const v1 = values[i + 1] as number;
    const v2 = values[i + 2];
    const v3 = values[i + 3];
    out.push((v0 << 2) | (v1 >> 4));
    if (v2 !== undefined) {
      out.push(((v1 & 15) << 4) | (v2 >> 2));
    }
    if (v3 !== undefined) {
      out.push((((v2 as number) & 3) << 6) | v3);
    }
  }
  if (base64urlEncode(Uint8Array.from(out)) !== text) {
    throw new Error("Non-canonical base64url");
  }
  return Uint8Array.from(out);
}
