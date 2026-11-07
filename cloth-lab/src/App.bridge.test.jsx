// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App.jsx'
import { DEFAULT_MEASUREMENTS } from './state/measurements'
vi.mock('@react-three/fiber', () => ({ Canvas: ({ children }) => children }))
vi.mock('./scene/Scene', () => ({ default: ({ garment, paused }) => <div data-preview={garment?.pieces?.length || 0} data-paused={paused} /> }))
vi.mock('./ui/MeasurementPanel', () => ({ default: () => null }))
vi.mock('./ui/FabricPanel', () => ({ default: () => null }))
vi.mock('./ui/AvatarPanel', () => ({ default: () => null, DEFAULT_SKIN_TONE: 'light', DEFAULT_POSE: 'standing' }))
vi.mock('./ui/ExportPanel', () => ({ default: () => <div data-panel="export" /> }))
globalThis.IS_REACT_ACT_ENVIRONMENT = true
let root, container
const payload = () => ({ designId: 'test', designName:'My design', category:'women', measurements:DEFAULT_MEASUREMENTS.women, lang:'en', pieces:[{id:'custom',label:{en:'My custom panel',ar:'قطعتي'},role:'front-panel',cutOnFold:false,bilateral:false,outline:[[0,0],[20,0],[20,30],[0,30]]}] })
async function render(pattern, extra = {}) {
  if (!root) { container=document.createElement('div');document.body.append(container);root=createRoot(container) }
  await act(async()=>root.render(<App embedded pattern={pattern} {...extra} />))
}
const buttons = () => [...container.querySelectorAll('button')]
async function click(text) { const button=buttons().find(b=>b.textContent.includes(text)); expect(button, text).toBeTruthy(); await act(async()=>button.click()) }
// The novice path: one press of the primary action builds and drapes the garment.
const tryOn = () => click('Try it on')
const preview = () => container.querySelector('[data-preview]')
beforeEach(()=>{ const data=new Map(); Object.defineProperty(window,'localStorage',{configurable:true,value:{getItem:k=>data.get(k)||null,setItem:(k,v)=>data.set(k,v),clear:()=>data.clear()}}) })
afterEach(async()=>{if(root) await act(async()=>root.unmount());container?.remove();root=null})
describe('guided imported garment workflow',()=>{
  it('shows the actual source first and never silently renders a demo',async()=>{
    await render(payload());expect(container.textContent).toContain('My custom panel');expect(preview()).toBeNull()
    expect(container.textContent).toContain('Step 1 of 3')
    expect(container.textContent).not.toContain('[object Object]')
  })
  it('goes from pattern to draped preview in one click, with no blocking questions',async()=>{
    await render(payload());await tryOn()
    expect(preview().dataset.preview).toBe('1')
    expect(container.querySelector('.cl-stepper [aria-current="step"]').textContent).toContain('Try on')
  })
  it('the stepper "Try on" builds the garment instead of bouncing back',async()=>{
    await render(payload())
    const step=[...container.querySelectorAll('.cl-stepper button')].find(b=>b.textContent.includes('Try on'))
    await act(async()=>step.click());expect(preview().dataset.preview).toBe('1')
  })
  it('preserves finalized garment across the first language-only update',async()=>{
    const p=payload();await render(p);await tryOn();await render({...p,lang:'ar'})
    expect(preview().dataset.preview).toBe('1')
    expect(container.querySelector('.cloth-lab-root').dir).toBe('rtl')
  })
  it('preserves a pending edge selection during translation',async()=>{
    const p=payload();await render(p);await click('Next: check the seams')
    const edge=container.querySelector('g.cl-edge');await act(async()=>edge.dispatchEvent(new MouseEvent('click',{bubbles:true})))
    // A free stretch becomes a temporary named edge, so look it up again.
    expect(container.querySelectorAll('g.cl-edge[aria-pressed="true"]').length).toBe(1)
    expect(container.textContent).toContain('Now click the edge it sews to')
    await render({...p,lang:'ar'});expect(container.querySelector('g.cl-edge[aria-pressed="true"]')).not.toBeNull()
  })
  it('invalidates old simulation on geometry or design identity change',async()=>{
    const p=payload();await render(p);await tryOn();await render({...p,designId:'other'})
    expect(preview()).toBeNull();expect(container.textContent).toContain('Step 1 of 3')
  })
  it('starts without a demo when no source design is provided',async()=>{
    await render(null);expect(container.textContent).toContain('Start with your pattern');expect(preview()).toBeNull()
  })
  it('preserves the BodyForm body-only entry',async()=>{
    await render(payload(),{bodyOnly:true});expect(preview().dataset.preview).toBe('0');expect(container.querySelector('.cl-pieces')).toBeNull()
  })
  it('pauses and resumes without discarding the garment',async()=>{
    await render(payload());await tryOn();await click('Pause');expect(preview().dataset.paused).toBe('true')
    await click('Resume');expect(preview().dataset.paused).toBe('false')
  })
  it('restart retains the current pattern and saved joins instead of resetting to a demo',async()=>{
    await render(payload());await tryOn();await click('Restart drape')
    expect(container.textContent).not.toContain('T-shirt')
    expect(preview().dataset.preview).toBe('1')
    expect(container.textContent).toContain('Pause')
  })
  it('going back to Sew keeps the seams editable',async()=>{
    await render(payload());await tryOn()
    const sew=[...container.querySelectorAll('.cl-stepper button')].find(b=>b.textContent.includes('Sew'))
    await act(async()=>sew.click());expect(container.querySelector('g.cl-edge')).not.toBeNull()
  })
})

it('standalone body-only mode accepts no pattern or saved editor',async()=>{
  await render(null,{bodyOnly:true});expect(preview()).not.toBeNull()
  // BodyForm keeps Export visible straight away (no tab to find) — the
  // deploy smoke test clicks "Export GLB" right after generating the avatar.
  expect(container.querySelector('[data-panel="export"]')).not.toBeNull()
  expect(container.querySelector('[role=tab]')).toBeNull()
})
