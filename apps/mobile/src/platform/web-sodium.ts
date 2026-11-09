import sumo from "libsodium-wrappers-sumo";
import type { Sodium } from "@parapka/crypto";

type Sumo = typeof sumo;

function signing(api: Sumo): Pick<Sodium, "signKeyPair" | "sign" | "verify"> {
  return {
    signKeyPair() {
      const pair = api.crypto_sign_keypair();
      return { publicKey: pair.publicKey, privateKey: pair.privateKey };
    },
    sign(msg, secret) {
      return api.crypto_sign_detached(msg, secret);
    },
    verify(sig, msg, pub) {
      return api.crypto_sign_verify_detached(sig, msg, pub);
    },
  };
}

function keyExchange(
  api: Sumo,
): Pick<Sodium, "kxKeyPair" | "kxClientSessionKeys" | "kxServerSessionKeys"> {
  return {
    kxKeyPair() {
      const pair = api.crypto_kx_keypair();
      return { publicKey: pair.publicKey, privateKey: pair.privateKey };
    },
    kxClientSessionKeys(ownPublic, ownSecret, peerPublic) {
      return api.crypto_kx_client_session_keys(
        ownPublic,
        ownSecret,
        peerPublic,
      );
    },
    kxServerSessionKeys(ownPublic, ownSecret, peerPublic) {
      return api.crypto_kx_server_session_keys(
        ownPublic,
        ownSecret,
        peerPublic,
      );
    },
  };
}

/** Sodium for the web build on libsodium-wrappers-sumo (waits for `ready`). */
export async function createWebSodium(): Promise<Sodium> {
  await sumo.ready;
  return {
    ...signing(sumo),
    ...keyExchange(sumo),
    randomBytes(count) {
      return sumo.randombytes_buf(count);
    },
    aeadEncrypt(plain, ad, nonce, key) {
      return sumo.crypto_aead_xchacha20poly1305_ietf_encrypt(
        plain,
        ad,
        null,
        nonce,
        key,
      );
    },
    aeadDecrypt(sealed, ad, nonce, key) {
      return sumo.crypto_aead_xchacha20poly1305_ietf_decrypt(
        null,
        sealed,
        ad,
        nonce,
        key,
      );
    },
    hash(outLength, data, key = null) {
      return sumo.crypto_generichash(outLength, data, key);
    },
    kdfDeriveFromKey(outLength, id, ctx, master) {
      return sumo.crypto_kdf_derive_from_key(outLength, id, ctx, master);
    },
    pwhash(outLength, password, salt) {
      return sumo.crypto_pwhash(
        outLength,
        password,
        salt,
        sumo.crypto_pwhash_OPSLIMIT_INTERACTIVE,
        sumo.crypto_pwhash_MEMLIMIT_INTERACTIVE,
        sumo.crypto_pwhash_ALG_ARGON2ID13,
      );
    },
  };
}
