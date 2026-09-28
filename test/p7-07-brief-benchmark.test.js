import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { updateDesignBrief, prepareBriefDraft, toggleDesignBriefFieldLock } from '../js/design-brief.js';

const corpus = JSON.parse(readFileSync(new URL('../evaluation/p7-07/corpus.json', import.meta.url)));

test('P7-07 local brief benchmark is versioned and meets every declared outcome', () => {
  assert.equal(corpus.id, 'p7-07-local-brief-foundation.v1');
  assert.ok(Array.isArray(corpus.cases) && corpus.cases.length >= 6);
  for (const entry of corpus.cases) {
    let brief = null;
    entry.messages.forEach((message, index) => {
      if (entry.lockBeforeMessage?.messageIndex === index) brief = toggleDesignBriefFieldLock(brief, entry.lockBeforeMessage.field);
      brief = updateDesignBrief(brief, message, entry.language);
    });
    const prepared = prepareBriefDraft(brief, corpus.defaultsCm);
    assert.equal(prepared.decision, entry.expect.decision, entry.id);
    if (entry.expect.issue) assert.ok(prepared.issues.some(issue => issue.code === entry.expect.issue), entry.id);
    for (const [field, value] of Object.entries(entry.expect.fields || {})) assert.equal(brief.fields[field]?.value, value, `${entry.id}: ${field}`);
  }
});
