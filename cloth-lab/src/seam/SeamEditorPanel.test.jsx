import { describe, it, expect } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import SeamEditorPanel from './SeamEditorPanel.jsx'

// Regression test for a real, user-reported crash: "when i click two seam
// points in seam view it crashes." Every real garment piece imported from
// the root BerryStudio app carries a BILINGUAL `label: {en, ar}` object —
// every rawPieces.push() in pattern/importFromApp.js passes p.label
// straight through, never extracting a string (see that file for all 8
// call sites). Only the built-in skirt demo (pattern/library/skirt.js)
// happens to use a plain string label, which is why this went unnoticed
// in earlier manual testing (which only ever exercised that demo).
// pieceLabel() used to return that raw object, and it's rendered as a
// bare JSX child the moment `pendingEdges` gets its first entry — i.e.
// the instant the SECOND click of an edge completes it — which makes
// React throw "Objects are not valid as a React child" and crash the
// whole panel. Fixed by extracting a display string (lang-aware, falling
// back to `.en` then the piece id) instead of handing React the object.
function stubEditor(overrides = {}) {
  return {
    drafts: [
      { id: 'front', label: { en: 'Front Panel', ar: 'اللوحة الأمامية' }, role: 'front-panel', edges: {} },
      { id: 'back', label: { en: 'Back Panel', ar: 'اللوحة الخلفية' }, role: 'back-panel', edges: {} },
    ],
    pendingStart: null,
    pendingEdges: [],
    seams: [],
    error: null,
    commitSeam: () => {},
    removeSeam: () => {},
    toggleReverse: () => {},
    clearPending: () => {},
    finalize: () => null,
    ...overrides,
  }
}

describe('SeamEditorPanel', () => {
  it('renders a pending edge for a piece with an object {en,ar} label without throwing', () => {
    const editor = stubEditor({
      pendingEdges: [{ pieceIdx: 0, edgeName: 'edge1', from: 0, to: 1 }],
    })
    const html = renderToStaticMarkup(<SeamEditorPanel lang="en" editor={editor} onSimulate={() => {}} />)
    expect(html).toMatch(/Front Panel/) // the en label text, not [object Object]
    expect(html).not.toMatch(/\[object Object\]/)
  })

  it('respects an Arabic lang prop for the same pending-edge render', () => {
    const editor = stubEditor({
      pendingEdges: [{ pieceIdx: 1, edgeName: 'edge1', from: 0, to: 1 }],
    })
    const html = renderToStaticMarkup(<SeamEditorPanel lang="ar" editor={editor} onSimulate={() => {}} />)
    expect(html).toMatch(/اللوحة الخلفية/)
  })

  it('renders a pendingStart on an object-labeled piece, not [object Object]', () => {
    const editor = stubEditor({ pendingStart: { pieceIdx: 0, vertIdx: 3 } })
    const html = renderToStaticMarkup(<SeamEditorPanel lang="en" editor={editor} onSimulate={() => {}} />)
    expect(html).toMatch(/Front Panel/)
    expect(html).not.toMatch(/\[object Object\]/)
  })

  it('still works unchanged for the pre-existing plain-string label (the built-in skirt demo)', () => {
    const editor = stubEditor({
      drafts: [
        { id: 'frontSkirt', label: 'Front Skirt', role: 'hipPanelFront', edges: {} },
        { id: 'backSkirt', label: 'Back Skirt', role: 'hipPanelBack', edges: {} },
      ],
      pendingEdges: [{ pieceIdx: 0, edgeName: 'edge1', from: 0, to: 1 }],
    })
    const html = renderToStaticMarkup(<SeamEditorPanel lang="en" editor={editor} onSimulate={() => {}} />)
    expect(html).toMatch(/Front Skirt/)
  })
})
