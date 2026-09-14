import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';

for (const file of ['index.html', 'body.html']) {
  test(`${file}: the production CSP authorizes the exact inline import map`, () => {
    const html = readFileSync(new URL(`../${file}`, import.meta.url), 'utf8');
    const importMap = html.match(/<script type="importmap">([\s\S]*?)<\/script>/)?.[1];
    assert.ok(importMap, 'an import map must exist');
    assert.ok(JSON.parse(importMap).imports.react, 'React must resolve for the embedded workspace');
    const policy = html.match(/http-equiv="Content-Security-Policy" content="([^"]+)"/)?.[1];
    const scripts = policy?.match(/(?:^|;)\s*script-src\s+([^;]+)/)?.[1].split(/\s+/);
    const hash = createHash('sha256').update(importMap).digest('base64');
    assert.ok(scripts?.includes(`'sha256-${hash}'`), 'update CSP when import map bytes change');
    assert.ok(!scripts.includes("'unsafe-inline'"), 'do not allow arbitrary inline scripts');
  });
}
