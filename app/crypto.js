// Yijeeb E2EE — ECDH P-256 + HKDF + AES-GCM (Web Crypto فقط)
window.YijCrypto = (() => {
  const enc = new TextEncoder();
  const dec = new TextDecoder();

  const b64 = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf)));
  const unb64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

  async function genKeypair() {
    const kp = await crypto.subtle.generateKey({ name: "ECDH", namedCurve: "P-256" }, true, ["deriveKey", "deriveBits"]);
    const pub = await crypto.subtle.exportKey("raw", kp.publicKey);
    const priv = await crypto.subtle.exportKey("pkcs8", kp.privateKey);
    return { publicKey: b64(pub), privateKey: b64(priv) };
  }

  const importPriv = (k) => crypto.subtle.importKey("pkcs8", unb64(k), { name: "ECDH", namedCurve: "P-256" }, false, ["deriveKey", "deriveBits"]);
  const importPub = (k) => crypto.subtle.importKey("raw", unb64(k), { name: "ECDH", namedCurve: "P-256" }, false, []);

  async function deriveShared(myPrivB64, theirPubB64) {
    const shared = await crypto.subtle.deriveBits(
      { name: "ECDH", public: await importPub(theirPubB64) },
      await importPriv(myPrivB64),
      256
    );
    const base = await crypto.subtle.importKey("raw", shared, "HKDF", false, ["deriveKey"]);
    return crypto.subtle.deriveKey(
      { name: "HKDF", hash: "SHA-256", salt: new Uint8Array(0), info: enc.encode("yijeeb-v1") },
      base, { name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]
    );
  }

  async function encrypt(key, plaintext) {
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const ct = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, enc.encode(plaintext));
    return { ciphertext: b64(ct), iv: b64(iv) };
  }
  async function decrypt(key, ctB64, ivB64) {
    const pt = await crypto.subtle.decrypt({ name: "AES-GCM", iv: unb64(ivB64) }, key, unb64(ctB64));
    return dec.decode(pt);
  }

  async function generateGroupKey() {
    return crypto.subtle.generateKey({ name: "AES-GCM", length: 256 }, true, ["encrypt", "decrypt"]);
  }
  async function exportAesKey(key) { return b64(await crypto.subtle.exportKey("raw", key)); }
  async function importAesKey(rawB64) { return crypto.subtle.importKey("raw", unb64(rawB64), { name: "AES-GCM" }, true, ["encrypt", "decrypt"]); }

  async function wrapGroupKeyForMember(groupAesKey, ownerPrivB64, memberPubB64) {
    const shared = await deriveShared(ownerPrivB64, memberPubB64);
    const raw = await crypto.subtle.exportKey("raw", groupAesKey);
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const ct = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, shared, raw);
    return { wrapped_key: b64(ct), iv: b64(iv) };
  }
  async function unwrapGroupKey(payload, memberPrivB64, ownerPubB64) {
    const shared = await deriveShared(memberPrivB64, ownerPubB64);
    const raw = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: unb64(payload.iv) }, shared, unb64(payload.wrapped_key)
    );
    return importAesKey(b64(raw));
  }

  async function encryptFile(key, arrayBuffer) {
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const ct = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, arrayBuffer);
    return { ciphertext: ct, iv: b64(iv) };
  }
  async function decryptFile(key, ctBuf, ivB64) {
    return crypto.subtle.decrypt({ name: "AES-GCM", iv: unb64(ivB64) }, key, ctBuf);
  }

  async function deriveBackupKey(recoveryCode, saltB64, iterations) {
    const base = await crypto.subtle.importKey("raw", enc.encode(recoveryCode), "PBKDF2", false, ["deriveKey"]);
    return crypto.subtle.deriveKey(
      { name: "PBKDF2", salt: unb64(saltB64), iterations, hash: "SHA-256" },
      base, { name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]
    );
  }
  function generateRecoveryCode() {
    const bytes = crypto.getRandomValues(new Uint8Array(24));
    const hex = [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
    return hex.match(/.{8}/g).join("-");
  }
  async function createKeyBackup(recoveryCode, keys) {
    const salt = crypto.getRandomValues(new Uint8Array(16));
    const saltB64 = b64(salt);
    const iterations = 600000;
    const backupKey = await deriveBackupKey(recoveryCode, saltB64, iterations);
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const ct = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, backupKey, enc.encode(JSON.stringify(keys)));
    return { ciphertext: b64(ct), iv: b64(iv), salt: saltB64, iterations };
  }
  async function restoreFromBackup(recoveryCode, payload) {
    const backupKey = await deriveBackupKey(recoveryCode, payload.salt, payload.iterations);
    const pt = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: unb64(payload.iv) }, backupKey, unb64(payload.ciphertext)
    );
    return JSON.parse(dec.decode(pt));
  }

  return {
    genKeypair, deriveShared, encrypt, decrypt,
    generateGroupKey, exportAesKey, importAesKey,
    wrapGroupKeyForMember, unwrapGroupKey,
    encryptFile, decryptFile,
    deriveBackupKey, generateRecoveryCode, createKeyBackup, restoreFromBackup,
    b64, unb64,
  };
})();
