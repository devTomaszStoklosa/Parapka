/** SHA-256 of the bytes (web: Web Crypto; native: M9). */
export type Sha256 = (bytes: Uint8Array) => Promise<Uint8Array>;

export const webSha256: Sha256 = async (bytes) => {
  // Copy into a plain ArrayBuffer, which `digest` accepts on every lib version.
  const copy = new Uint8Array(bytes.length);
  copy.set(bytes);
  return new Uint8Array(await crypto.subtle.digest("SHA-256", copy));
};
