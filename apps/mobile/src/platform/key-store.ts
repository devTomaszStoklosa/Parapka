/**
 * Storage for secret key material, injected into the app (spec 7.2).
 *
 * WARNING: the web implementation keeps keys in IndexedDB without hardware
 * protection. It is meant for tests and browser-first development only.
 * Native key storage (Keychain/Keystore) comes in M9.
 */
export interface KeyStore {
  /** Bytes stored under `name`, or null when there are none. */
  get(name: string): Promise<Uint8Array | null>;
  set(name: string, bytes: Uint8Array): Promise<void>;
  delete(name: string): Promise<void>;
  clear(): Promise<void>;
}
