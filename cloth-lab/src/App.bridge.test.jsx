// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App.jsx'
import { DEFAULT_MEASUREMENTS } from './state/measurements'

vi.mock('@react-three/fiber', () => ({ Canvas: () => null }))
vi.mock('./scene/Scene', () => ({ default: () => null }))
vi.mock('./ui/Header', () => ({ default: ({ debugView, onDebugViewChange }) => <div data-view={debugView}>{['cloth', 'pieces', 'weld', 'seams'].map(view => <button key={view} onClick={() => onDebugViewChange(view)}>{view}</button>)}</div> }))
vi.mock('./seam/SeamEditorPanel', () => ({ default: ({ onSimulate, editor }) => <><button onClick={() => onSimulate({ pieces: [], seams: [] })}>Simulate</button><button onClick={() => editor.handleVertexClick(0, 0)}>Select start</button><output data-pending={JSON.stringify(editor.pendingStart)} /></> }))
vi.mock('./ui/MeasurementPanel', () => ({ default: () => null }))
vi.mock('./ui/FabricPanel', () => ({ default: () => null }))
vi.mock('./ui/AvatarPanel', () => ({ default: () => null, DEFAULT_SKIN_TONE: 'light', DEFAULT_POSE: 'standing' }))
vi.mock('./ui/ExportPanel', () => ({ default: () => null }))
vi.mock('./pattern/importFromApp', () => ({ convertAppPattern: () => ({ rawPieces: [], roles: {}, skipped: [], recognized: [] }) }))

globalThis.IS_REACT_ACT_ENVIRONMENT = true
let root, container
const payload = () => ({ category: 'women', measurements: DEFAULT_MEASUREMENTS.women, pieces: [], lang: 'en' })
async function render(pattern, extra = {}) {
  if (!root) { container = document.createElement('div'); document.body.append(container); root = createRoot(container) }
  await act(async () => root.render(<App embedded pattern={pattern} {...extra} />))
}
const view = () => container.querySelector('[data-view]').dataset.view
async function click(text) {
  await act(async () => [...container.querySelectorAll('button')].find(b => b.textContent === text).click())
}
afterEach(async () => { if(root) await act(async () => root.unmount()); container?.remove(); root = null })
describe('imported garment workflow', () => {
  it('opens initial imported pattern in seam review, not demo cloth', async () => {
    await render(payload()); expect(view()).toBe('seams')
  })
  it('cannot show the fallback T-shirt before an import is finalized', async () => {
    await render(payload());
    for (const preview of ['cloth', 'pieces', 'weld']) { await click(preview); expect(view()).toBe('seams') }
    await click('Simulate'); expect(view()).toBe('cloth')
  })
  it('preserves a simulated garment on the first language-only update', async () => {
    const pattern = payload(); await render(pattern); await click('Simulate')
    await render({ ...pattern, lang: 'ar' }); expect(view()).toBe('cloth')
    expect(container.querySelector('.cloth-lab-root').dir).toBe('rtl')
  })
  it('resets to seam review when pattern geometry changes', async () => {
    const pattern = payload(); await render(pattern); await click('Simulate')
    await render({ ...pattern, pieces: [{ id: 'new' }] }); expect(view()).toBe('seams')
  })
  it('keeps BodyForm in body-only view and standalone demo in cloth view', async () => {
    await render(null); expect(view()).toBe('cloth')
  })
  it('starts BodyForm without a garment', async () => {
    await render(payload(), { bodyOnly: true }); expect(view()).toBe('off')
  })
  it('preserves an in-progress seam selection across language-only updates', async () => {
    const pattern = payload(); await render(pattern); await click('Select start')
    const selection = container.querySelector('output').dataset.pending
    await render({ ...pattern, lang: 'ar' })
    expect(container.querySelector('output').dataset.pending).toBe(selection)
    expect(selection).not.toBe('null')
  })

})
