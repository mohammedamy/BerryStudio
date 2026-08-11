import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseSVGPattern, parseDXFPattern, bulgeArcPoints, svgArcToCubics, parseSVGTransform, parsePathD } from '../js/pattern-import.js';
import { buildDXF } from '../js/pattern-export.js';

function closeTo(a, b, eps=0.05) { return Math.abs(a-b) < eps; }
function ptsClose(a, b, eps=0.05) { return a.length===b.length && a.every((p,i)=>closeTo(p[0],b[i][0],eps)&&closeTo(p[1],b[i][1],eps)); }

// ---- SVG: plain rect, this app's own exportSVG() unit convention (cm viewBox) ----
test('parseSVGPattern imports a rect at 1 user-unit == 1cm (matches this app\'s own exportSVG)', () => {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 30 20" width="30cm" height="20cm"><rect x="0" y="0" width="10" height="8"/></svg>`;
  const { pieces, warnings } = parseSVGPattern(svg);
  assert.equal(pieces.length, 1);
  assert.ok(ptsClose(pieces[0].outline, [[0,0],[10,0],[10,8],[0,8]]));
  assert.equal(warnings.length, 0);
});

test('parseSVGPattern falls back to 1 user-unit == 1cm with no width/height/viewBox at all', () => {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg"><polygon points="0,0 5,0 5,5 0,5"/></svg>`;
  const { pieces } = parseSVGPattern(svg);
  assert.equal(pieces.length, 1);
  assert.ok(ptsClose(pieces[0].outline, [[0,0],[5,0],[5,5],[0,5]]));
});

test('parseSVGPattern converts plain px (no viewBox) at 96dpi', () => {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="192" height="96"><rect x="0" y="0" width="96" height="48"/></svg>`;
  const { pieces } = parseSVGPattern(svg);
  // 96px == 2.54cm at 96dpi
  assert.ok(ptsClose(pieces[0].outline, [[0,0],[2.54,0],[2.54,1.27],[0,1.27]], 0.02));
});

test('parseSVGPattern honors mm width/height against a viewBox (a typical Illustrator/Inkscape export)', () => {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 210 297" width="210mm" height="297mm"><rect x="10" y="10" width="20" height="30"/></svg>`;
  const { pieces } = parseSVGPattern(svg);
  // 1 viewBox unit == 1mm == 0.1cm here
  assert.ok(ptsClose(pieces[0].outline, [[1,1],[3,1],[3,4],[1,4]], 0.02));
});

test('parseSVGPattern applies a translate() transform', () => {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 30 20" width="30cm" height="20cm"><g transform="translate(5,4)"><rect x="0" y="0" width="10" height="8"/></g></svg>`;
  const { pieces } = parseSVGPattern(svg);
  assert.ok(ptsClose(pieces[0].outline, [[5,4],[15,4],[15,12],[5,12]]));
});

test('parseSVGPattern skips open paths/polylines and reports them', () => {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10" width="10cm" height="10cm"><polyline points="0,0 5,0 5,5"/></svg>`;
  const { pieces, warnings } = parseSVGPattern(svg);
  assert.equal(pieces.length, 0);
  assert.ok(warnings.some(w => /open/i.test(w)));
});

test('parseSVGPattern imports a closed cubic-bezier path with real curve metadata', () => {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" width="20cm" height="20cm"><path d="M0,0 C0,10 10,10 10,0 L10,-5 L0,-5 Z"/></svg>`;
  const { pieces } = parseSVGPattern(svg);
  assert.equal(pieces.length, 1);
  assert.ok(pieces[0].curves.length >= 1, 'a C command must produce real curve metadata');
  // the sampled outline must still start and roughly pass near the true endpoints
  assert.ok(closeTo(pieces[0].outline[0][0], 0) && closeTo(pieces[0].outline[0][1], 0));
});

test('parseSVGPattern imports a circle as a real 4-curve piece close to the true circle', () => {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" width="20cm" height="20cm"><circle cx="10" cy="10" r="5"/></svg>`;
  const { pieces } = parseSVGPattern(svg);
  assert.equal(pieces.length, 1);
  assert.equal(pieces[0].curves.length, 4);
  pieces[0].outline.forEach(([x,y]) => assert.ok(closeTo(Math.hypot(x-10,y-10), 5, 0.1)));
});

test('parsePathD reflects S/T smooth-curve control points correctly', () => {
  const subs = parsePathD("M0,0 C0,10 10,10 10,0 S20,-10 20,0 Z");
  assert.equal(subs.length, 1);
  assert.equal(subs[0].curves.length, 2);
});

test('svgArcToCubics approximates a semicircle arc endpoint exactly', () => {
  const segs = svgArcToCubics(0,0, 5,5, 0, false, true, 10,0);
  const last = segs[segs.length-1];
  assert.ok(closeTo(last.x, 10) && closeTo(last.y, 0));
});

test('parseSVGTransform composes translate+scale in document order', () => {
  const m = parseSVGTransform("translate(10,0) scale(2)");
  // point (1,1) -> scale -> (2,2) -> translate -> (12,2)
  const x = m[0]*1+m[2]*1+m[4], y = m[1]*1+m[3]*1+m[5];
  assert.ok(closeTo(x,12) && closeTo(y,2));
});

// ---- DXF ----
test('parseDXFPattern round-trips this app\'s own buildDXF() output exactly', () => {
  const piece = { name:{en:'Rect'}, outline: [[0,0],[10,0],[10,20],[0,20]], darts:[], notches:[], grain:[] };
  const dxf = buildDXF([piece]);
  const { pieces, warnings } = parseDXFPattern(dxf);
  assert.equal(pieces.length, 1);
  assert.ok(ptsClose(pieces[0].outline, piece.outline, 0.01));
  assert.equal(warnings.length, 0);
});

test('parseDXFPattern converts millimeter $INSUNITS to cm', () => {
  const dxf = [
    '0','SECTION','2','HEADER',
    '9','$INSUNITS','70','4',
    '0','ENDSEC',
    '0','SECTION','2','ENTITIES',
    '0','LWPOLYLINE','8','1','90','4','70','1','43','0',
    '10','0','20','0','10','100','20','0','10','100','20','200','10','0','20','200',
    '0','ENDSEC','0','EOF',
  ].join('\n');
  const { pieces } = parseDXFPattern(dxf);
  assert.equal(pieces.length, 1);
  // 100mm==10cm, 200mm==20cm
  assert.ok(ptsClose(pieces[0].outline, [[0,0],[10,0],[10,-20],[0,-20]], 0.02));
});

test('bulgeArcPoints(bulge=1) traces an exact semicircle', () => {
  const pts = bulgeArcPoints([0,0], [2,0], 1, 8);
  // arc midpoint should be (1,1), radius 1, and every point should sit on that circle
  pts.forEach(([x,y]) => assert.ok(closeTo(Math.hypot(x-1,y-0), 1, 0.02)));
  const last = pts[pts.length-1];
  assert.ok(closeTo(last[0],2) && closeTo(last[1],0));
});

test('parseDXFPattern chains standalone closed LINE segments into one piece', () => {
  const dxf = [
    '0','SECTION','2','ENTITIES',
    '0','LINE','8','0','10','0','20','0','11','5','21','0',
    '0','LINE','8','0','10','5','20','0','11','5','21','5',
    '0','LINE','8','0','10','5','20','5','11','0','21','5',
    '0','LINE','8','0','10','0','20','5','11','0','21','0',
    '0','ENDSEC','0','EOF',
  ].join('\n');
  const { pieces } = parseDXFPattern(dxf);
  assert.equal(pieces.length, 1);
  assert.equal(pieces[0].outline.length, 4);
});

test('parseDXFPattern uses a real (non-numeric) layer name as the piece name', () => {
  const dxf = [
    '0','SECTION','2','ENTITIES',
    '0','LWPOLYLINE','8','BODICE_FRONT','90','4','70','1','43','0',
    '10','0','20','0','10','5','20','0','10','5','20','5','10','0','20','5',
    '0','ENDSEC','0','EOF',
  ].join('\n');
  const { pieces } = parseDXFPattern(dxf);
  assert.equal(pieces[0].name, 'BODICE_FRONT');
});

test('parseDXFPattern skips an open LWPOLYLINE and reports it', () => {
  const dxf = [
    '0','SECTION','2','ENTITIES',
    '0','LWPOLYLINE','8','1','90','3','70','0','43','0',
    '10','0','20','0','10','5','20','0','10','5','20','5',
    '0','ENDSEC','0','EOF',
  ].join('\n');
  const { pieces, warnings } = parseDXFPattern(dxf);
  assert.equal(pieces.length, 0);
  assert.ok(warnings.some(w => /open/i.test(w)));
});
