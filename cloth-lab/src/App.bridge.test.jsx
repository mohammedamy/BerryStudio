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
vi.mock('./ui/ExportPanel', () => ({ default: () => null }))
globalThis.IS_REACT_ACT_ENVIRONMENT = true
let root, container
const payload = () => ({ designId: 'test', designName:'My design', category:'women', measurements:DEFAULT_MEASUREMENTS.women, lang:'en', pieces:[{id:'custom',label:{en:'My custom panel',ar:'قطعتي'},role:'front-panel',cutOnFold:false,bilateral:false,outline:[[0,0],[20,0],[20,30],[0,30]]}] })
async function render(pattern, extra = {}) {
  if (!root) { container=document.createElement('div');document.body.append(container);root=createRoot(container) }
  await act(async()=>root.render(<App embedded pattern={pattern} {...extra} />))
}
async function click(text) { const button=[...container.querySelectorAll('button')].find(b=>b.textContent.includes(text)); expect(button, text).toBeTruthy(); await act(async()=>button.click()) }
async function choose(text) { const label=[...container.querySelectorAll('label')].find(l=>l.textContent.includes(text)); expect(label,text).toBeTruthy(); await act(async()=>label.querySelector('input').click()) }
async function simulate() { await click('Continue to joins'); await choose('Keep it separate'); await click('Simulate This Garment') }
beforeEach(()=>{ const data=new Map(); Object.defineProperty(window,'localStorage',{configurable:true,value:{getItem:k=>data.get(k)||null,setItem:(k,v)=>data.set(k,v),clear:()=>data.clear()}}) })
afterEach(async()=>{if(root) await act(async()=>root.unmount());container?.remove();root=null})
describe('guided imported garment workflow',()=>{
  it('reviews the actual source and never silently renders a demo before configuration',async()=>{
    await render(payload());expect(container.textContent).toContain('My custom panel');expect(container.querySelector('[data-preview]')).toBeNull()
    await click('3 · Simulate');expect(container.querySelector('[data-preview]')).toBeNull()
  })
  it('requires an attachment decision, then previews the configured source',async()=>{
    await render(payload());await click('Continue to joins')
    expect([...container.querySelectorAll('button')].find(b=>b.textContent.includes('Simulate This Garment')).disabled).toBe(true)
    await choose('Keep it separate'); await click('Simulate This Garment')
    expect(container.querySelector('[data-preview]').dataset.preview).toBe('1')
  })
  it('preserves finalized garment across the first language-only update',async()=>{
    const p=payload();await render(p);await simulate();await render({...p,lang:'ar'})
    expect(container.querySelector('[data-preview]').dataset.preview).toBe('1')
    expect(container.querySelector('.cloth-lab-root').dir).toBe('rtl')
  })
  it('preserves pending seam point selection during translation',async()=>{
    const p=payload();await render(p);await click('Continue to joins')
    const point=container.querySelector('circle[role=button]');await act(async()=>point.dispatchEvent(new MouseEvent('click',{bubbles:true})))
    expect(point.getAttribute('fill')).toBe('#ffc34a')
    await render({...p,lang:'ar'});expect(container.querySelector('circle[role=button]').getAttribute('fill')).toBe('#ffc34a')
  })
  it('invalidates old simulation on geometry or design identity change',async()=>{
    const p=payload();await render(p);await simulate();await render({...p,designId:'other'})
    expect(container.querySelector('[data-preview]')).toBeNull();expect(container.textContent).toContain('Review your pattern')
  })
  it('starts without a demo when no source design is provided',async()=>{
    await render(null);expect(container.textContent).toContain('Start with your pattern');expect(container.querySelector('[data-preview]')).toBeNull()
  })
  it('preserves the BodyForm body-only entry',async()=>{
    await render(payload(),{bodyOnly:true});expect(container.querySelector('[data-preview]').dataset.preview).toBe('0');expect(container.querySelector('.cl-review')).toBeNull()
  })
  it('pauses and resumes without discarding the garment',async()=>{
    await render(payload());await simulate();await click('Pause');expect(container.querySelector('[data-preview]').dataset.paused).toBe('true')
    await click('Resume');expect(container.querySelector('[data-preview]').dataset.paused).toBe('false')
  })
  it('restart retains the current pattern and saved joins instead of resetting to a demo',async()=>{
    await render(payload());await simulate();await click('Restart drape')
    expect(container.textContent).not.toContain('T-shirt')
    expect(container.querySelector('[data-preview]').dataset.preview).toBe('1')
    expect(container.textContent).toContain('Pause')
  })
})

it('standalone body-only mode accepts no pattern or saved editor',async()=>{await render(null,{bodyOnly:true});expect(container.querySelector('[data-preview]')).not.toBeNull();expect([...container.querySelectorAll('details')].find(d=>d.querySelector('summary')?.textContent==='Export').open).toBe(true)})
