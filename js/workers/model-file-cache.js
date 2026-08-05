/* ============================================================
   IndexedDB/OPFS byte cache for a user-picked local model file —
   BerryStudio-Upgrade-Plan-v2.0 WP-21 (Route B: real .onnx file picker).

   A plain ES module with no worker-specific APIs (indexedDB and
   navigator.storage both exist on `window` too) — shared, unmodified,
   between the main thread (js/app.js, so the Settings panel can show
   "cached: foo.onnx" without waking the worker) and
   js/workers/local-model-worker.js (which actually runs inference against
   the cached bytes). Both read/write the same origin-scoped storage.

   IndexedDB holds the bytes directly for files up to ~2GB (comfortably
   inside every major browser's per-origin IndexedDB quota); a raw .onnx
   export above that goes to OPFS instead, which is built for exactly this
   size class. Only ONE cached model is kept at a time (a fixed key) —
   this is a "your last picked local model persists across a reload"
   cache, not a model library.
   ============================================================ */
const DB_NAME = 'berrystudio-local-models';
const STORE = 'files';
const KEY = 'route-b-onnx';
const OPFS_DIR_NAME = 'berrystudio-local-models';
const OPFS_THRESHOLD = 2 * 1024 * 1024 * 1024; // ~2GB — IndexedDB blob storage gets unreliable near/above this in some browsers

function openDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => { req.result.createObjectStore(STORE); };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function idbGet(key) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readonly');
    const req = tx.objectStore(STORE).get(key);
    req.onsuccess = () => resolve(req.result || null);
    req.onerror = () => reject(req.error);
  });
}
async function idbSet(key, value) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).put(value, key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}
async function idbDelete(key) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).delete(key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function opfsDir() {
  const root = await navigator.storage.getDirectory();
  return root.getDirectoryHandle(OPFS_DIR_NAME, { create: true });
}

// { name, mimeType, bytes: ArrayBuffer } -> persists it, replacing
// whatever local model file was previously cached.
export async function saveModelFile({ name, mimeType, bytes }) {
  if (bytes.byteLength > OPFS_THRESHOLD) {
    const dir = await opfsDir();
    const handle = await dir.getFileHandle(KEY, { create: true });
    const writable = await handle.createWritable();
    await writable.write(bytes);
    await writable.close();
    await idbSet(KEY, { storage: 'opfs', name, mimeType, size: bytes.byteLength, savedAt: Date.now() });
  } else {
    await idbSet(KEY, { storage: 'idb', name, mimeType, size: bytes.byteLength, bytes, savedAt: Date.now() });
  }
}

// Cheap metadata-only read (never the bytes) — safe to call on every
// Settings-panel render so the UI can honestly show "cached: foo.onnx,
// 42MB" or "no model cached" without touching a single byte of the model.
export async function getModelFileMeta() {
  const rec = await idbGet(KEY);
  if (!rec) return null;
  const { bytes, ...meta } = rec;
  return meta; // {storage, name, mimeType, size, savedAt}
}

// The real bytes — only called when the user explicitly asks to restore
// ("Load cached model" click), never automatically on page load, so a
// reload with no explicit restore stays honestly "no model loaded".
export async function loadModelFile() {
  const rec = await idbGet(KEY);
  if (!rec) return null;
  if (rec.storage === 'opfs') {
    const dir = await opfsDir();
    const handle = await dir.getFileHandle(KEY);
    const file = await handle.getFile();
    return { name: rec.name, mimeType: rec.mimeType, bytes: await file.arrayBuffer() };
  }
  return { name: rec.name, mimeType: rec.mimeType, bytes: rec.bytes };
}

export async function clearModelFile() {
  await idbDelete(KEY);
  try {
    const dir = await opfsDir();
    await dir.removeEntry(KEY);
  } catch (e) { /* wasn't stored in OPFS, or already gone — not an error */ }
}
