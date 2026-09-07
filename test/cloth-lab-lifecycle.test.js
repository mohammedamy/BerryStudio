import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';

// Exercise the real host lifecycle with a deferred module download.
const app = readFileSync(new URL('../js/app.js', import.meta.url), 'utf8');
const source = app.slice(app.indexOf('  function loadClothLab(){'), app.indexOf('  function clothLabOrigin(){'))
  .replace(/import\(\/\* @vite-ignore \*\/ embedUrl\)/g, 'mockImport(embedUrl)')
  .replaceAll('import.meta.url', '"https://berrystudio.org/js/app.js"');
function setup() {
  let resolve, mounts = 0, updates = 0, unmounts = 0, ready;
  const pending = new Promise(r => { resolve = r; });
  const frame = { contentWindow: {}, dataset: {}, removeAttribute() { delete this.src; } };
  const context = vm.createContext({
    state: { clothLabEngine: 'embedded' }, clothLabReady: false, lastClothLabPayloadJSON: null,
    gateAllowed: () => true, hideClothLabGate() {}, renderClothLabGate() {},
    $: selector => selector === '#clothLabFrame' ? frame : {},
    location: { hostname: 'berrystudio.org' }, clothLabOrigin: () => 'https://berrystudio.org', URL, console,
    mockImport: () => pending, buildClothLabPayload: () => ({ pieces: [] }),
    syncClothLab: () => { updates++; },
  });
  vm.runInContext(source, context);
  const finish = () => resolve({ mount(_container, options) { mounts++; ready = options.onReady; return { unmount() { unmounts++; } }; } });
  return { context, frame, finish, ready: () => ready(), counts: () => ({ mounts, updates, unmounts }) };
}
test('a module download finishing after teardown cannot mount a stale engine', async () => {
  const h = setup(); const loading = vm.runInContext('mountClothLabEmbedded()', h.context);
  vm.runInContext('teardownClothLab()', h.context); h.finish(); await loading;
  assert.equal(h.counts().mounts, 0);
});
test('embedded readiness synchronizes the latest host pattern', async () => {
  const h = setup(); const loading = vm.runInContext('mountClothLabEmbedded()', h.context);
  h.finish(); await loading; h.ready();
  assert.equal(h.counts().updates, 1); assert.equal(h.context.clothLabReady, true);
});
test('switching to iframe tears down the embedded root and starts the iframe', async () => {
  const h = setup(); vm.runInContext('loadClothLab()', h.context);
  const loading = vm.runInContext('clothLabEmbedLoadPromise', h.context);
  h.finish(); await loading; h.ready();
  h.context.state.clothLabEngine = 'iframe'; vm.runInContext('loadClothLab()', h.context);
  assert.equal(h.counts().unmounts, 1); assert.equal(h.frame.src, 'cloth-lab/');
  assert.equal(h.context.clothLabReady, false);
});
test('sign-out while a download is pending prevents mounting even before UI refresh', async () => {
  const h = setup(); const loading = vm.runInContext('mountClothLabEmbedded()', h.context);
  h.context.gateAllowed = () => false;
  h.finish(); await loading;
  assert.equal(h.counts().mounts, 0);
});
test('a late ready callback cannot revive a torn-down engine', async () => {
  const h = setup(); const loading = vm.runInContext('mountClothLabEmbedded()', h.context);
  h.finish(); await loading;
  vm.runInContext('teardownClothLab()', h.context); h.ready();
  assert.equal(h.context.clothLabReady, false);
  assert.equal(h.counts().updates, 0);
});
test('sign-out tears down an engine even while another view is visible', async () => {
  const h = setup(); const loading = vm.runInContext('mountClothLabEmbedded()', h.context);
  h.finish(); await loading; h.ready();
  Object.assign(h.context, { gateAllowed: () => false, renderLibraryPane() {}, renderAIPane() {}, renderBuilderPane() {}, renderExportPane() {} });
  h.context.state.view = '2d';
  vm.runInContext(app.slice(app.indexOf('  function refreshGatedUI(){'), app.indexOf('  async function refreshEntitlement(')), h.context);
  vm.runInContext('refreshGatedUI()', h.context);
  assert.equal(h.counts().unmounts, 1);
  assert.equal(h.context.clothLabReady, false);
});

test('iframe readiness requires the active loaded frame, correct origin and entitlement', () => {
  const h = setup(); h.context.state.clothLabEngine = 'iframe';
  vm.runInContext('loadClothLab()', h.context);
  h.context.event = { data: { type: 'clothlab:ready' }, source: h.frame.contentWindow, origin: 'https://wrong.example' };
  vm.runInContext('handleClothLabReady(event)', h.context);
  assert.equal(h.context.clothLabReady, false);
  h.context.event.origin = 'https://berrystudio.org';
  vm.runInContext('handleClothLabReady(event)', h.context);
  assert.equal(h.context.clothLabReady, true);
  assert.equal(h.counts().updates, 1);
  vm.runInContext('teardownClothLab(); handleClothLabReady(event)', h.context);
  assert.equal(h.context.clothLabReady, false);
  assert.equal(h.counts().updates, 1);
});
