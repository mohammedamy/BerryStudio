import { test } from "node:test";
import assert from "node:assert/strict";

// KeyStore (js/ai-keystore.js, reused by SelfHostedSync for its auth token)
// wraps sessionStorage access in try/catch and no-ops silently when it's
// unavailable — this Node version has no global sessionStorage, so a
// minimal in-memory shim is needed for the token-header test below to be
// meaningful rather than silently passing on a no-op.
if (typeof globalThis.sessionStorage === "undefined") {
  const store = new Map();
  globalThis.sessionStorage = {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: (k) => store.delete(k),
  };
}

const { SelfHostedSync } = await import("../js/cloud-sync.js");

// WP-18: the self-hosted sync target is the one part of cloud sync with no
// external OAuth dependency, so it's the part that's meaningfully unit-
// testable in Node — mock fetch and assert the real request shape.

function withMockFetch(impl, fn) {
  const original = globalThis.fetch;
  globalThis.fetch = impl;
  return Promise.resolve(fn()).finally(() => { globalThis.fetch = original; });
}

test("SelfHostedSync.save PUTs the payload as JSON to the configured URL", async () => {
  let captured = null;
  await withMockFetch(
    async (url, opts) => { captured = { url, opts }; return { ok: true }; },
    () => SelfHostedSync.save("https://example.com/project.json", { app: "BerryStudio", pieces: [] })
  );
  assert.equal(captured.url, "https://example.com/project.json");
  assert.equal(captured.opts.method, "PUT");
  assert.equal(captured.opts.headers["Content-Type"], "application/json");
  assert.deepEqual(JSON.parse(captured.opts.body), { app: "BerryStudio", pieces: [] });
});

test("SelfHostedSync.save throws with the real server status on a non-OK response", async () => {
  await assert.rejects(
    () => withMockFetch(
      async () => ({ ok: false, status: 500, statusText: "Internal Server Error" }),
      () => SelfHostedSync.save("https://example.com/project.json", {})
    ),
    /500/
  );
});

test("SelfHostedSync.save throws a clear error when no URL is configured", async () => {
  await assert.rejects(() => SelfHostedSync.save("", {}), /No sync endpoint configured/);
});

test("SelfHostedSync.load GETs and parses JSON from the configured URL", async () => {
  let capturedUrl = null;
  const result = await withMockFetch(
    async (url) => { capturedUrl = url; return { ok: true, json: async () => ({ app: "BerryStudio", pieces: [{ name: "x" }] }) }; },
    () => SelfHostedSync.load("https://example.com/project.json")
  );
  assert.equal(capturedUrl, "https://example.com/project.json");
  assert.equal(result.pieces[0].name, "x");
});

test("SelfHostedSync sends an Authorization header only when a token is set", async () => {
  let capturedHeaders = null;
  SelfHostedSync.setToken("secret-token");
  await withMockFetch(
    async (url, opts) => { capturedHeaders = opts.headers; return { ok: true }; },
    () => SelfHostedSync.save("https://example.com/project.json", {})
  );
  assert.equal(capturedHeaders.Authorization, "Bearer secret-token");
  SelfHostedSync.setToken("");
});
