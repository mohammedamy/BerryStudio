import { test } from 'node:test';
import assert from 'node:assert/strict';
import { extractSVGMarkup, generateSVGPatternFromImage, SVG_PATTERN_PROMPT } from '../js/ai-spec-pipeline.js';

const RECT_SVG = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10" width="10cm" height="10cm"><rect x="1" y="1" width="5" height="5"/></svg>';

function mockAdapter(responses) {
  let call = 0;
  const calls = [];
  return {
    calls,
    complete: async (cfg, req) => { calls.push(req); return responses[Math.min(call++, responses.length - 1)]; },
  };
}

test('extractSVGMarkup pulls a bare <svg> document out unchanged', () => {
  assert.equal(extractSVGMarkup(RECT_SVG), RECT_SVG);
});

test('extractSVGMarkup strips prose before/after and a markdown code fence', () => {
  const wrapped = `Sure, here is the pattern:\n\n\`\`\`svg\n${RECT_SVG}\n\`\`\`\n\nLet me know if you need adjustments!`;
  assert.equal(extractSVGMarkup(wrapped), RECT_SVG);
});

test('extractSVGMarkup returns null when no <svg> is present', () => {
  assert.equal(extractSVGMarkup('I cannot generate SVG markup.'), null);
});

test('extractSVGMarkup returns null on a truncated document (no closing tag)', () => {
  assert.equal(extractSVGMarkup('<svg xmlns="...">no closing tag here'), null);
});

test('generateSVGPatternFromImage fails cleanly with no image', async () => {
  const res = await generateSVGPatternFromImage({ adapter: mockAdapter([]), cfg: {}, imageDataURL: null });
  assert.equal(res.ok, false);
  assert.equal(res.reason, 'no-image');
});

test('generateSVGPatternFromImage sends the exact prompt as `system`, attaches the image, requests a raised token budget', async () => {
  const adapter = mockAdapter([{ ok: true, text: RECT_SVG }]);
  const res = await generateSVGPatternFromImage({ adapter, cfg: {}, imageDataURL: 'data:image/png;base64,AAA' });
  assert.equal(res.ok, true);
  assert.equal(res.pieces.length, 1);
  assert.equal(adapter.calls[0].system, SVG_PATTERN_PROMPT);
  assert.deepEqual(adapter.calls[0].images, ['data:image/png;base64,AAA']);
  assert.equal(adapter.calls[0].maxTokens, 8192);
});

test('generateSVGPatternFromImage retries once with a corrective nudge when the first reply has no extractable SVG', async () => {
  const adapter = mockAdapter([
    { ok: true, text: 'Sorry, I cannot help with that.' },
    { ok: true, text: RECT_SVG },
  ]);
  const res = await generateSVGPatternFromImage({ adapter, cfg: {}, imageDataURL: 'data:image/png;base64,AAA' });
  assert.equal(res.ok, true);
  assert.equal(adapter.calls.length, 2);
  assert.match(adapter.calls[1].messages[0].content, /raw SVG markup/);
});

test('generateSVGPatternFromImage fails honestly if both attempts have no extractable SVG', async () => {
  const adapter = mockAdapter([{ ok: true, text: 'no svg here' }, { ok: true, text: 'still no svg' }]);
  const res = await generateSVGPatternFromImage({ adapter, cfg: {}, imageDataURL: 'data:image/png;base64,AAA' });
  assert.equal(res.ok, false);
  assert.equal(res.reason, 'no-svg-in-reply');
  assert.equal(adapter.calls.length, 2);
});

test('generateSVGPatternFromImage surfaces the provider error without retrying', async () => {
  const adapter = mockAdapter([{ ok: false, error: 'invalid API key' }]);
  const res = await generateSVGPatternFromImage({ adapter, cfg: {}, imageDataURL: 'data:image/png;base64,AAA' });
  assert.equal(res.ok, false);
  assert.equal(res.reason, 'invalid API key');
  assert.equal(adapter.calls.length, 1);
});

test('generateSVGPatternFromImage reports no-shapes (with warnings) for SVG with only open/degenerate shapes', async () => {
  const openSvg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10" width="10cm" height="10cm"><polyline points="0,0 5,0 5,5"/></svg>';
  const adapter = mockAdapter([{ ok: true, text: openSvg }]);
  const res = await generateSVGPatternFromImage({ adapter, cfg: {}, imageDataURL: 'data:image/png;base64,AAA' });
  assert.equal(res.ok, false);
  assert.equal(res.reason, 'no-shapes');
  assert.ok(res.warnings.length > 0);
});
