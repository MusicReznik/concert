window.ENCRYPTED_FIREBASE = {
  "v": 1,
  "iters": 100000,
  "salt": "jfU4ykLUrXgwu1nq9/ox2g==",
  "iv": "G7U7BJvc/+Zq/OU8",
  "data": "GEMZjTrHpqsXM9UK67y148l7G6Da0GfgAH9pGnA3Z/BWglKuyEgLbCEFM/zeBA5du1Vnn/j/bF8gYkn/qvQEDk0e8JKW3h6pxqG0zKoeFGhjT1B6H8GsWCK2VXGwqmhV/Q0T1gbrU2skVXqDTJKvNRK8mFtZfUG/5jmkJMiAGbEB9n09026HSeT/mHK4mkuG4pOvAmFumemqJaOflqI416OHRNMQAjkHxXaTStC5NtxuyJ+S5wUrwuJtQTVlb2dhzwHOR5xzQFnZPoTgvzu5BXSpWybRCi8hErwuO0AQe5ph7hQF/xvvDjggN1n8GbdVxix0jS1tuKdtPIVX2TeA9FrR97lLzGEl4iG+rtX7E3uQ74nnIP4VsiHMwXV7sF3AF4TNt9hfbWhIQEsq6YndO+5Hd9zK6VTthdKjMd0Ae2607iF2GxZ6NyiEdIyUpZyq13USi8KKNUBCjoUdQdC9QgqV+SGAagoRoPQaUM6DY58U0mZPmWK7+wgaiABYkvtOQ4lggA=="
};

window.FIREBASE_CONFIG = null;
window.USE_FIREBASE = false;
window.FIREBASE_UNLOCKED = false;

window.unlockFirebase = async function (password) {
  const payload = window.ENCRYPTED_FIREBASE;
  if (!payload || !payload.data) {
    throw new Error("Зашифрованный конфиг не найден");
  }
  const cfg = await window.MariaCrypto.decryptConfig(password, payload);
  window.FIREBASE_CONFIG = cfg;
  window.FIREBASE_UNLOCKED = true;

  const real =
    cfg &&
    cfg.apiKey &&
    cfg.databaseURL &&
    cfg.apiKey !== "REPLACE_ME" &&
    !String(cfg.apiKey).startsWith("REPLACE");

  window.USE_FIREBASE = !!real;

  if (real && typeof firebase !== "undefined") {
    try {
      if (!(firebase.apps && firebase.apps.length)) {
        firebase.initializeApp(cfg);
      }
      if (window.Realtime && typeof window.Realtime.attachFirebase === "function") {
        window.Realtime.attachFirebase();
      }
    } catch (e) {
      console.warn("Firebase init:", e);
      window.USE_FIREBASE = false;
    }
  }
  return { useFirebase: window.USE_FIREBASE, projectId: cfg.projectId || null };
};
