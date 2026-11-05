import lib from "libsodium-wrappers-sumo";
import type { Sodium } from "./sodium.js";

/** Sodium backed by libsodium-wrappers-sumo, for tests only. */
export async function createTestSodium(): Promise<Sodium> {
  await lib.ready;
  return {
    randomBytes: (length) => lib.randombytes_buf(length),
    signKeyPair: () => {
      const { publicKey, privateKey } = lib.crypto_sign_keypair();
      return { publicKey, privateKey };
    },
    sign: (message, privateKey) =>
      lib.crypto_sign_detached(message, privateKey),
    verify: (signature, message, publicKey) =>
      lib.crypto_sign_verify_detached(signature, message, publicKey),
    kxKeyPair: () => {
      const { publicKey, privateKey } = lib.crypto_kx_keypair();
      return { publicKey, privateKey };
    },
    kxClientSessionKeys: (clientPublicKey, clientPrivateKey, serverPublicKey) =>
      lib.crypto_kx_client_session_keys(
        clientPublicKey,
        clientPrivateKey,
        serverPublicKey,
      ),
    kxServerSessionKeys: (serverPublicKey, serverPrivateKey, clientPublicKey) =>
      lib.crypto_kx_server_session_keys(
        serverPublicKey,
        serverPrivateKey,
        clientPublicKey,
      ),
    aeadEncrypt: (message, additionalData, nonce, key) =>
      lib.crypto_aead_xchacha20poly1305_ietf_encrypt(
        message,
        additionalData,
        null,
        nonce,
        key,
      ),
    aeadDecrypt: (ciphertext, additionalData, nonce, key) =>
      lib.crypto_aead_xchacha20poly1305_ietf_decrypt(
        null,
        ciphertext,
        additionalData,
        nonce,
        key,
      ),
    hash: (length, message, key = null) =>
      lib.crypto_generichash(length, message, key),
    kdfDeriveFromKey: (length, subkeyId, context, key) =>
      lib.crypto_kdf_derive_from_key(length, subkeyId, context, key),
  };
}
