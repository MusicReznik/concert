/**
 * Password-based encryption for Firebase config (Web Crypto API).
 * PBKDF2-SHA256 + AES-GCM-256
 */
(function () {
  function b64ToBuf(b64) {
    const bin = atob(b64);
    const buf = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) buf[i] = bin.charCodeAt(i);
    return buf;
  }

  function bufToB64(buf) {
    let s = "";
    const u = new Uint8Array(buf);
    for (let i = 0; i < u.length; i++) s += String.fromCharCode(u[i]);
    return btoa(s);
  }

  async function deriveKey(password, salt, iterations) {
    const enc = new TextEncoder();
    const baseKey = await crypto.subtle.importKey(
      "raw",
      enc.encode(password),
      "PBKDF2",
      false,
      ["deriveKey"]
    );
    return crypto.subtle.deriveKey(
      { name: "PBKDF2", salt, iterations, hash: "SHA-256" },
      baseKey,
      { name: "AES-GCM", length: 256 },
      false,
      ["encrypt", "decrypt"]
    );
  }

  /**
   * Decrypt payload produced by tools/encrypt-config.html
   * @returns {object} parsed Firebase config
   */
  async function decryptConfig(password, payload) {
    if (!payload || !payload.salt || !payload.iv || !payload.data) {
      throw new Error("Нет зашифрованного конфига");
    }
    const salt = b64ToBuf(payload.salt);
    const iv = b64ToBuf(payload.iv);
    const data = b64ToBuf(payload.data);
    const iters = payload.iters || 100000;
    const key = await deriveKey(password, salt, iters);
    try {
      const plain = await crypto.subtle.decrypt(
        { name: "AES-GCM", iv },
        key,
        data
      );
      const text = new TextDecoder().decode(plain);
      return JSON.parse(text);
    } catch (e) {
      throw new Error("Неверный пароль или повреждённый конфиг");
    }
  }

  /**
   * Encrypt plain config object → payload for firebase-config.js
   */
  async function encryptConfig(password, configObj, iterations) {
    const iters = iterations || 100000;
    const salt = crypto.getRandomValues(new Uint8Array(16));
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const key = await deriveKey(password, salt, iters);
    const plain = new TextEncoder().encode(JSON.stringify(configObj));
    const cipher = await crypto.subtle.encrypt(
      { name: "AES-GCM", iv },
      key,
      plain
    );
    return {
      v: 1,
      iters,
      salt: bufToB64(salt),
      iv: bufToB64(iv),
      data: bufToB64(cipher)
    };
  }

  window.MariaCrypto = { decryptConfig, encryptConfig, bufToB64, b64ToBuf };
})();
