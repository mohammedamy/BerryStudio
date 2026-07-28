import { test } from 'node:test';
import assert from 'node:assert/strict';

// Plain Node has crypto.subtle/btoa/atob globally (verified: Node 19+), but
// not sessionStorage/localStorage (those are DOM Storage API) — a minimal
// in-memory Map-backed shim is enough to exercise js/ai-keystore.js's logic
// without pulling in jsdom for this one file.
class MemoryStorage {
  constructor() { this._m = new Map(); }
  getItem(k) { return this._m.has(k) ? this._m.get(k) : null; }
  setItem(k, v) { this._m.set(k, String(v)); }
  removeItem(k) { this._m.delete(k); }
}
globalThis.sessionStorage = new MemoryStorage();
globalThis.localStorage = new MemoryStorage();

const { KeyStore } = await import('../js/ai-keystore.js');

test('redact() never exposes the full key', () => {
  assert.equal(KeyStore.redact('sk-ant-api03-abcdefghijklmnop'), 'sk-…mnop');
  assert.equal(KeyStore.redact('short'), '•••');
  assert.equal(KeyStore.redact(''), '');
});

test('default tier: set/get/clear round-trips through sessionStorage, not localStorage', () => {
  KeyStore.set('openai', 'sk-test-123');
  assert.equal(KeyStore.get('openai'), 'sk-test-123');
  assert.equal(sessionStorage.getItem('aikeys:openai'), 'sk-test-123');
  assert.equal(localStorage.getItem('aikeys:openai'), null);
  KeyStore.clear('openai');
  assert.equal(KeyStore.get('openai'), null);
});

test('encrypted tier: locked by default, unlock() enables set/get, key never stored in plaintext', async () => {
  assert.equal(KeyStore.needsPassphrase(), true);
  await assert.rejects(() => KeyStore.setPersistent('anthropic', 'sk-ant-secret'), /locked/);

  await KeyStore.unlock('correct horse battery staple');
  assert.equal(KeyStore.needsPassphrase(), false);
  await KeyStore.setPersistent('anthropic', 'sk-ant-secret');

  const raw = localStorage.getItem('aikeys_enc:anthropic');
  assert.ok(raw, 'ciphertext should be present in localStorage');
  assert.doesNotMatch(raw, /sk-ant-secret/, 'the raw API key must never appear in plaintext in localStorage');

  const roundTripped = await KeyStore.getPersistent('anthropic');
  assert.equal(roundTripped, 'sk-ant-secret');

  KeyStore.lock();
  assert.equal(KeyStore.needsPassphrase(), true);
  await assert.rejects(() => KeyStore.getPersistent('anthropic'), /locked/);
});

test('unlocking with the wrong passphrase fails to decrypt rather than returning garbage silently', async () => {
  KeyStore.lock();
  await KeyStore.unlock('a completely different passphrase');
  await assert.rejects(() => KeyStore.getPersistent('anthropic'));
});

test('resolve() prefers the session tier over the encrypted tier when both exist', async () => {
  KeyStore.lock();
  await KeyStore.unlock('correct horse battery staple');
  KeyStore.set('anthropic', 'sk-session-wins');
  const resolved = await KeyStore.resolve('anthropic');
  assert.equal(resolved, 'sk-session-wins');
  KeyStore.clearSession('anthropic');
  const fallback = await KeyStore.resolve('anthropic');
  assert.equal(fallback, 'sk-ant-secret');
});

test('clear() removes both the session and encrypted copies', async () => {
  KeyStore.clear('anthropic');
  assert.equal(await KeyStore.resolve('anthropic'), null);
  assert.equal(localStorage.getItem('aikeys_enc:anthropic'), null);
});
