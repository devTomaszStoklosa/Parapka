/** A key pair; for Ed25519 the private key is the 64-byte libsodium secret key. */
export interface KeyPair {
  readonly publicKey: Uint8Array;
  readonly privateKey: Uint8Array;
}

/** Session keys of `crypto_kx`: what this side receives with and sends with. */
export interface SessionKeys {
  readonly sharedRx: Uint8Array;
  readonly sharedTx: Uint8Array;
}

/**
 * The only libsodium operations the app needs (spec 7.3, 7.4). The crypto
 * layer depends on this interface; implementations are synchronous once
 * created: react-native-libsodium in the app, the test implementation in tests.
 */
export interface Sodium {
  randomBytes(length: number): Uint8Array;

  signKeyPair(): KeyPair;
  /** Detached Ed25519 signature. */
  sign(message: Uint8Array, privateKey: Uint8Array): Uint8Array;
  /** Returns false for a signature that does not match the message and key. */
  verify(
    signature: Uint8Array,
    message: Uint8Array,
    publicKey: Uint8Array,
  ): boolean;

  /** X25519 key pair for `crypto_kx`. */
  kxKeyPair(): KeyPair;
  kxClientSessionKeys(
    clientPublicKey: Uint8Array,
    clientPrivateKey: Uint8Array,
    serverPublicKey: Uint8Array,
  ): SessionKeys;
  kxServerSessionKeys(
    serverPublicKey: Uint8Array,
    serverPrivateKey: Uint8Array,
    clientPublicKey: Uint8Array,
  ): SessionKeys;

  /** XChaCha20-Poly1305 IETF; the result is the ciphertext followed by the tag. */
  aeadEncrypt(
    message: Uint8Array,
    additionalData: Uint8Array | null,
    nonce: Uint8Array,
    key: Uint8Array,
  ): Uint8Array;
  /** Throws when the ciphertext, nonce, key or additional data was changed. */
  aeadDecrypt(
    ciphertext: Uint8Array,
    additionalData: Uint8Array | null,
    nonce: Uint8Array,
    key: Uint8Array,
  ): Uint8Array;

  /** BLAKE2b (`crypto_generichash`), with a key or without. */
  hash(
    length: number,
    message: Uint8Array,
    key?: Uint8Array | null,
  ): Uint8Array;

  /** `crypto_kdf_derive_from_key`; the context is 8 characters. */
  kdfDeriveFromKey(
    length: number,
    subkeyId: number,
    context: string,
    key: Uint8Array,
  ): Uint8Array;
}
