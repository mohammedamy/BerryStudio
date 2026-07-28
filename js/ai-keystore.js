/* ============================================================
   KeyStore — client-side storage for user-supplied AI provider API keys.
   BerryStudio-Upgrade-Plan WP-1, security requirements #1-#3.

   Storage tiers:
   1) DEFAULT — sessionStorage, cleared when the tab closes. The only
      tier reachable without an explicit opt-in.
   2) OPT-IN PERSISTENT (encrypted) — WebCrypto PBKDF2(passphrase,
      250,000 iterations, SHA-256) -> AES-GCM 256, ciphertext kept in
      localStorage (survives reloads). The derived AES key lives in
      memory only for the life of the tab — a fresh page load always
      re-prompts for the passphrase ("once per session").

   Honesty note: sessionStorage/localStorage are both readable by any
   script running on this page (e.g. an XSS bug). Encryption-at-rest
   protects a key that's sitting in localStorage across reloads; it
   does NOT protect a key while it is unlocked during a live page
   compromise. The UI must say this plainly before persistence is
   enabled — see js/i18n.js keyPersistWarn/keyPersistWarnD.

   redact() is the ONLY place a key may touch a string destined for a
   log line, toast, or exported file (WP-1 security requirement #3).
   Every new console.log/toast() call site added for AI features must
   route any key-adjacent value through it first.
   ============================================================ */
export const KeyStore = (() => {
  const SESSION_PREFIX = "aikeys:";
  const ENC_PREFIX = "aikeys_enc:";
  const SALT_KEY = "aikeys_enc_salt";
  const PBKDF2_ITERATIONS = 250000;

  // In-memory only — never persisted, cleared implicitly on reload.
  let derivedKey = null;

  function redact(key) {
    if (!key) return "";
    return key.length > 8 ? key.slice(0, 3) + "…" + key.slice(-4) : "•••";
  }

  // ---------- default tier: sessionStorage ----------
  function set(providerId, key) {
    try { sessionStorage.setItem(SESSION_PREFIX + providerId, key); }
    catch (e) { /* storage unavailable (private mode, quota) — key just isn't remembered */ }
  }
  function get(providerId) {
    try { return sessionStorage.getItem(SESSION_PREFIX + providerId); }
    catch (e) { return null; }
  }
  function clearSession(providerId) {
    try { sessionStorage.removeItem(SESSION_PREFIX + providerId); } catch (e) {}
  }
  function clear(providerId) {
    clearSession(providerId);
    try { localStorage.removeItem(ENC_PREFIX + providerId); } catch (e) {}
  }

  // ---------- opt-in tier: encrypted localStorage ----------
  function b64(bytes) { return btoa(String.fromCharCode(...new Uint8Array(bytes))); }
  function unb64(s) { return Uint8Array.from(atob(s), c => c.charCodeAt(0)); }

  // One shared salt for the whole encrypted tier (not secret — salts
  // never are; it just needs to be stable so the same passphrase always
  // re-derives the same key across reloads).
  function getSalt() {
    let s = null;
    try { s = localStorage.getItem(SALT_KEY); } catch (e) {}
    if (!s) {
      s = b64(crypto.getRandomValues(new Uint8Array(16)));
      try { localStorage.setItem(SALT_KEY, s); } catch (e) {}
    }
    return unb64(s);
  }

  async function deriveKey(passphrase) {
    const enc = new TextEncoder();
    const baseKey = await crypto.subtle.importKey("raw", enc.encode(passphrase), "PBKDF2", false, ["deriveKey"]);
    return crypto.subtle.deriveKey(
      { name: "PBKDF2", salt: getSalt(), iterations: PBKDF2_ITERATIONS, hash: "SHA-256" },
      baseKey, { name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]
    );
  }

  function isUnlocked() { return !!derivedKey; }
  function needsPassphrase() { return !derivedKey; }

  async function unlock(passphrase) {
    derivedKey = await deriveKey(passphrase);
    return true;
  }
  function lock() { derivedKey = null; }

  function hasPersistent(providerId) {
    try { return !!localStorage.getItem(ENC_PREFIX + providerId); } catch (e) { return false; }
  }

  async function setPersistent(providerId, key) {
    if (!derivedKey) throw new Error("KeyStore is locked — call unlock(passphrase) first");
    const iv = crypto.getRandomValues(new Uint8Array(12)); // fresh IV every encryption — never reuse
    const ciphertext = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, derivedKey, new TextEncoder().encode(key));
    localStorage.setItem(ENC_PREFIX + providerId, JSON.stringify({ iv: b64(iv), data: b64(ciphertext) }));
  }

  async function getPersistent(providerId) {
    if (!derivedKey) throw new Error("KeyStore is locked — call unlock(passphrase) first");
    let raw = null;
    try { raw = localStorage.getItem(ENC_PREFIX + providerId); } catch (e) {}
    if (!raw) return null;
    const { iv, data } = JSON.parse(raw);
    const dec = await crypto.subtle.decrypt({ name: "AES-GCM", iv: unb64(iv) }, derivedKey, unb64(data));
    return new TextDecoder().decode(dec);
  }

  function removePersistent(providerId) {
    try { localStorage.removeItem(ENC_PREFIX + providerId); } catch (e) {}
  }

  // ---------- unified resolver used by the provider layer ----------
  // Tries the session tier first (cheap, sync-friendly call sites use
  // get() directly); this async form also checks the encrypted tier if
  // it's unlocked. Returns null (not a thrown error) if a persistent key
  // exists but the store is still locked — callers should treat that as
  // "prompt for passphrase", not "no key configured".
  async function resolve(providerId) {
    const sessionVal = get(providerId);
    if (sessionVal != null) return sessionVal;
    if (hasPersistent(providerId) && isUnlocked()) return getPersistent(providerId);
    return null;
  }

  return {
    redact, set, get, clear, clearSession,
    needsPassphrase, isUnlocked, unlock, lock,
    hasPersistent, setPersistent, getPersistent, removePersistent,
    resolve,
  };
})();
