const ALPHABET =
  "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
const PATTERN =
  /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/;

/** Standard base64 with padding (RFC 4648 §4), the format of envelope fields. */
export function base64Encode(bytes: Uint8Array): string {
  let out = "";
  for (let i = 0; i < bytes.length; i += 3) {
    const b0 = bytes[i] as number;
    const b1 = bytes[i + 1];
    const b2 = bytes[i + 2];
    out += ALPHABET.charAt(b0 >> 2);
    out += ALPHABET.charAt(((b0 & 3) << 4) | ((b1 ?? 0) >> 4));
    out +=
      b1 === undefined
        ? "="
        : ALPHABET.charAt(((b1 & 15) << 2) | ((b2 ?? 0) >> 6));
    out += b2 === undefined ? "=" : ALPHABET.charAt(b2 & 63);
  }
  return out;
}

/** Strict decoder: throws on anything `base64Encode` would not produce. */
export function base64Decode(text: string): Uint8Array {
  if (!PATTERN.test(text)) throw new Error("Invalid base64");
  const out: number[] = [];
  for (let i = 0; i < text.length; i += 4) {
    const chunk = text.slice(i, i + 4);
    const v = (k: number) => ALPHABET.indexOf(chunk.charAt(k));
    out.push((v(0) << 2) | (v(1) >> 4));
    if (chunk[2] !== "=") out.push(((v(1) & 15) << 4) | (v(2) >> 2));
    if (chunk[3] !== "=") out.push(((v(2) & 3) << 6) | v(3));
  }
  const bytes = Uint8Array.from(out);
  if (base64Encode(bytes) !== text) throw new Error("Non-canonical base64");
  return bytes;
}
