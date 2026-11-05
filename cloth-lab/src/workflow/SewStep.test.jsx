// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest'
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { useSeamEditor } from '../seam/useSeamEditor'
import SewStep, { edgeLabel, friendlyError, positionLabel } from './SewStep.jsx'
globalThis.IS_REACT_ACT_ENVIRONMENT = true

// Real imported pieces carry BILINGUAL `label: {en, ar}` objects. The old
// seam panel once crashed ("Objects are not valid as a React child") the
// moment a second edge was picked because it rendered that raw object —
// this keeps the regression covered for the new Sew step.
const raw = [
  { id: 'front', sourceId: 'front', label: { en: 'Front Panel', ar: 'اللوحة الأمامية' }, outline: [[0, 0], [20, 0], [20, 30], [0, 30]] },
  { id: 'back', sourceId: 'back', label: { en: 'Back Panel', ar: 'اللوحة الخلفية' }, outline: [[0, 0], [20, 0], [20, 30], [0, 30]] },
]
const roles = { front: 'frontPanel', back: 'backPanel' }
let root, node, editor
async function mount(lang = 'en') {
  node = document.createElement('div'); document.body.append(node); root = createRoot(node)
  function Test() { editor = useSeamEditor(raw, roles, [], [], {}, null, { autoPlace: true }); return <SewStep editor={editor} lang={lang} /> }
  await act(async () => root.render(<Test />))
}
const run = fn => act(async () => fn())
const edges = () => [...node.querySelectorAll('g.cl-edge')]
afterEach(async () => { if (root) await act(async () => root.unmount()); node?.remove(); root = null })

describe('Sew step', () => {
  it('starts with how-to guidance and pieces hanging loose instead of blocking', async () => {
    await mount()
    expect(node.textContent).toContain('Click an edge of a piece')
    expect(node.textContent).toContain('Front Panel')
    expect(editor.unjoined).toHaveLength(0)
    expect(node.textContent).not.toContain('[object Object]')
  })
  it('walks through pick → pick → sew with bilingual labels and never renders an object', async () => {
    await mount()
    await run(() => edges().find(g => g.closest('[data-piece="front"]')).dispatchEvent(new MouseEvent('click', { bubbles: true })))
    expect(node.textContent).toContain('Now click the edge it sews to')
    await run(() => edges().find(g => g.closest('[data-piece="back"]')).dispatchEvent(new MouseEvent('click', { bubbles: true })))
    expect(node.textContent).toContain('Sew these edges')
    expect(node.textContent).not.toContain('[object Object]')
    const sew = [...node.querySelectorAll('button')].find(b => b.textContent.includes('Sew these edges'))
    await run(() => sew.click())
    expect(editor.seams).toHaveLength(1)
    expect(node.querySelectorAll('.cl-seam-badge').length).toBe(2)
  })
  it('renders Arabic piece names', async () => {
    await mount('ar')
    expect(node.textContent).toContain('اللوحة الأمامية')
    expect(node.textContent).not.toContain('[object Object]')
  })
})

describe('friendly wording', () => {
  it('turns importer edge names into plain words', () => {
    expect(edgeLabel('side_seam_l', 'en')).not.toMatch(/_/)
    expect(edgeLabel('shoulder', 'ar')).toContain('كتف')
  })
  it('names unnamed stretches by where they sit on the piece', () => {
    const draft = { outline: [[0, 0], [20, 0], [20, 30], [0, 30]] }
    expect(positionLabel(draft, 0, 1, 'en')).toBe('top edge')
    expect(positionLabel(draft, 2, 3, 'en')).toBe('bottom edge')
  })
  it('replaces technical errors with guidance', () => {
    expect(friendlyError('unjoined', false)).not.toMatch(/unjoined/)
  })
})
