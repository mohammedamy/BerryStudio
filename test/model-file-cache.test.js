import { test } from 'node:test';
import assert from 'node:assert/strict';

// Plain Node has no IndexedDB (jsdom doesn't ship one either, and this repo
// deliberately avoids pulling in a polyfill dependency for one test file —
// same call test/ai-keystore.test.js already made for sessionStorage). A
// minimal in-memory shim of exactly the subset js/workers/model-file-cache.js
// actually calls (indexedDB.open -> onupgradeneeded/onsuccess, a single
// object store's get/put/delete) is enough to exercise its real logic.
//
// Honesty note: this only exercises the IndexedDB (<~2GB) storage path.
// The OPFS path (files over the 2GB threshold) shares the same public API
// and the same tested get/save/load/clear logic around it, but isn't
// exercised here — a real test would need an actual 2GB+ ArrayBuffer,
// which isn't a reasonable thing to allocate in a unit test. That branch
// is small and structurally identical to WP-30/WP-22's "needs real
// hardware/data to verify" honesty pattern elsewhere in this plan.
class FakeIDBRequest {
  constructor() { this.onsuccess = null; this.onerror = null; this.result = undefined; this.error = null; }
  _succeed(result) { this.result = result; queueMicrotask(() => this.onsuccess && this.onsuccess()); }
  _fail(error) { this.error = error; queueMicrotask(() => this.onerror && this.onerror()); }
}
class FakeStore {
  constructor(map) { this._map = map; }
  get(key) { const req = new FakeIDBRequest(); req._succeed(this._map.has(key) ? this._map.get(key) : undefined); return req; }
  put(value, key) { this._map.set(key, value); return new FakeIDBRequest(); }
  delete(key) { this._map.delete(key); return new FakeIDBRequest(); }
}
class FakeTx {
  constructor(map) { this._map = map; this.oncomplete = null; this.onerror = null; queueMicrotask(() => this.oncomplete && this.oncomplete()); }
  objectStore() { return new FakeStore(this._map); }
}
class FakeDB {
  constructor(map) { this._map = map; }
  transaction() { return new FakeTx(this._map); }
}
function installFakeIndexedDB() {
  const map = new Map();
  globalThis.indexedDB = {
    open() {
      const req = new FakeIDBRequest();
      req.result = new FakeDB(map);
      // Real IndexedDB fires onupgradeneeded before onsuccess on first
      // open — the module's onupgradeneeded handler only calls
      // createObjectStore(), which this fake has no notion of (its one
      // Map *is* the store), so it's safe to skip.
      queueMicrotask(() => req.onsuccess && req.onsuccess());
      return req;
    },
  };
  return map;
}

installFakeIndexedDB();
const { saveModelFile, getModelFileMeta, loadModelFile, clearModelFile } = await import('../js/workers/model-file-cache.js');

test('getModelFileMeta returns null and loadModelFile returns null when nothing is cached', async () => {
  assert.equal(await getModelFileMeta(), null);
  assert.equal(await loadModelFile(), null);
});

test('saveModelFile then getModelFileMeta reports metadata WITHOUT the bytes', async () => {
  const bytes = new Uint8Array([1, 2, 3, 4]).buffer;
  await saveModelFile({ name: 'classifier.onnx', mimeType: 'application/octet-stream', bytes });
  const meta = await getModelFileMeta();
  assert.equal(meta.name, 'classifier.onnx');
  assert.equal(meta.storage, 'idb');
  assert.equal(meta.size, 4);
  assert.equal('bytes' in meta, false);
});

test('loadModelFile round-trips the exact bytes previously saved', async () => {
  const original = new Uint8Array([9, 8, 7, 6, 5]).buffer;
  await saveModelFile({ name: 'seg.onnx', mimeType: 'application/octet-stream', bytes: original });
  const loaded = await loadModelFile();
  assert.equal(loaded.name, 'seg.onnx');
  assert.deepEqual(Array.from(new Uint8Array(loaded.bytes)), [9, 8, 7, 6, 5]);
});

test('saveModelFile overwrites — only one model is cached at a time', async () => {
  await saveModelFile({ name: 'first.onnx', mimeType: '', bytes: new Uint8Array([1]).buffer });
  await saveModelFile({ name: 'second.onnx', mimeType: '', bytes: new Uint8Array([2]).buffer });
  const meta = await getModelFileMeta();
  assert.equal(meta.name, 'second.onnx');
});

test('clearModelFile removes the cached entry', async () => {
  await saveModelFile({ name: 'to-clear.onnx', mimeType: '', bytes: new Uint8Array([1]).buffer });
  assert.notEqual(await getModelFileMeta(), null);
  await clearModelFile();
  assert.equal(await getModelFileMeta(), null);
});
