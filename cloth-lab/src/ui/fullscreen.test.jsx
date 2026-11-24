// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import App from '../App.jsx'
import { DEFAULT_MEASUREMENTS } from '../state/measurements'

vi.mock('@react-three/fiber', () => ({ Canvas: ({ children }) => children }))
vi.mock('../scene/Scene', () => ({ default: ({ garment }) => <div data-preview={garment?.pieces?.length || 0} /> }))
vi.mock('./MeasurementPanel', () => ({ default: () => <input data-testid="mock-input" defaultValue="90" /> }))
vi.mock('./FabricPanel', () => ({ default: () => null }))
vi.mock('./AvatarPanel', () => ({ default: () => null, DEFAULT_SKIN_TONE: 'light', DEFAULT_POSE: 'standing' }))
vi.mock('./ExportPanel', () => ({ default: () => null }))

globalThis.IS_REACT_ACT_ENVIRONMENT = true

let root
let container

const payload = (lang = 'en') => ({
  designId: 'fs-test',
  designName: 'Fullscreen Dress',
  category: 'women',
  measurements: DEFAULT_MEASUREMENTS.women,
  lang,
  pieces: [
    {
      id: 'panel',
      label: { en: 'Front panel', ar: 'الأمام' },
      role: 'front-panel',
      cutOnFold: false,
      bilateral: false,
      outline: [[0, 0], [20, 0], [20, 30], [0, 30]],
    },
  ],
})

async function renderApp(pattern = payload(), extra = {}) {
  if (!root) {
    container = document.createElement('div')
    document.body.append(container)
    root = createRoot(container)
  }
  await act(async () => root.render(<App embedded pattern={pattern} {...extra} />))
}

const byTestId = (id) => container.querySelector(`[data-testid="${id}"]`)

beforeEach(() => {
  document.body.className = ''
  Object.defineProperty(document, 'fullscreenElement', { configurable: true, writable: true, value: null })
  Object.defineProperty(document, 'exitFullscreen', { configurable: true, writable: true, value: vi.fn().mockResolvedValue(undefined) })
  const data = new Map()
  Object.defineProperty(window, 'localStorage', {
    configurable: true,
    value: {
      getItem: (k) => data.get(k) || null,
      setItem: (k, v) => data.set(k, v),
      clear: () => data.clear(),
    },
  })
})

afterEach(async () => {
  if (root) await act(async () => root.unmount())
  container?.remove()
  root = null
  container = null
  document.body.className = ''
})

describe('Cloth Lab full screen mode', () => {
  it('enters and exits full screen via the header button and updates EN/AR labels', async () => {
    await renderApp(payload('en'))
    const clRoot = container.querySelector('.cloth-lab-root')
    const headerBtn = byTestId('cl-fullscreen-header-btn')

    expect(headerBtn.getAttribute('aria-pressed')).toBe('false')
    expect(headerBtn.textContent).toContain('Full screen')
    expect(clRoot.classList.contains('is-fullscreen')).toBe(false)

    await act(async () => headerBtn.click())
    expect(clRoot.classList.contains('is-fullscreen')).toBe(true)
    expect(document.body.classList.contains('clothlab-fullscreen-active')).toBe(true)
    expect(headerBtn.getAttribute('aria-pressed')).toBe('true')
    expect(headerBtn.textContent).toContain('Exit full screen')

    // Switches labels smoothly to Arabic when root language switches.
    await renderApp(payload('ar'))
    expect(byTestId('cl-fullscreen-header-btn').textContent).toContain('إنهاء ملء الشاشة')

    await act(async () => byTestId('cl-fullscreen-header-btn').click())
    expect(clRoot.classList.contains('is-fullscreen')).toBe(false)
    expect(document.body.classList.contains('clothlab-fullscreen-active')).toBe(false)
    expect(byTestId('cl-fullscreen-header-btn').textContent).toContain('ملء الشاشة')
  })

  it('supports stage toolbar Full screen, Exit full screen, and Hide/Show panel buttons', async () => {
    await renderApp(payload('en'))
    const tryOnBtn = [...container.querySelectorAll('button')].find((b) => b.textContent.includes('Try it on'))
    await act(async () => tryOnBtn.click())

    const clRoot = container.querySelector('.cloth-lab-root')
    const stageFsBtn = byTestId('cl-fullscreen-stage-btn')
    expect(stageFsBtn.textContent).toContain('Full screen')
    expect(byTestId('cl-stage-only-btn')).toBeNull()

    await act(async () => stageFsBtn.click())
    expect(clRoot.classList.contains('is-fullscreen')).toBe(true)
    expect(stageFsBtn.textContent).toContain('Exit full screen')

    const stageOnlyBtn = byTestId('cl-stage-only-btn')
    expect(stageOnlyBtn.textContent).toContain('Hide panel')
    await act(async () => stageOnlyBtn.click())
    expect(clRoot.classList.contains('is-stage-only')).toBe(true)
    expect(stageOnlyBtn.textContent).toContain('Show panel')

    // Exiting full screen also resets stage-only presentation mode.
    await act(async () => stageFsBtn.click())
    expect(clRoot.classList.contains('is-fullscreen')).toBe(false)
    expect(clRoot.classList.contains('is-stage-only')).toBe(false)
  })

  it('exits on Escape, toggles on F outside form inputs, and cleans up on unmount', async () => {
    await renderApp(payload('en'))
    const clRoot = container.querySelector('.cloth-lab-root')

    // Typing "f" inside a form control must not toggle fullscreen.
    const tryOnBtn = [...container.querySelectorAll('button')].find((b) => b.textContent.includes('Try it on'))
    await act(async () => tryOnBtn.click())
    const bodyTab = [...container.querySelectorAll('[role="tab"]')].find((b) => b.textContent.includes('Body'))
    await act(async () => bodyTab.click())
    const input = byTestId('mock-input')
    await act(async () => {
      input.dispatchEvent(new KeyboardEvent('keydown', { key: 'f', bubbles: true }))
    })
    expect(clRoot.classList.contains('is-fullscreen')).toBe(false)

    // Pressing "f" outside inputs enters fullscreen; pressing "Escape" exits it.
    await act(async () => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'f', bubbles: true }))
    })
    expect(clRoot.classList.contains('is-fullscreen')).toBe(true)

    await act(async () => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    })
    expect(clRoot.classList.contains('is-fullscreen')).toBe(false)

    // Unmount leaves document.body clean even if unmounted while fullscreen.
    await act(async () => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'f', bubbles: true }))
    })
    expect(document.body.classList.contains('clothlab-fullscreen-active')).toBe(true)
    await act(async () => root.unmount())
    root = null
    expect(document.body.classList.contains('clothlab-fullscreen-active')).toBe(false)
  })

  it('syncs cleanly with native Fullscreen API request/exit and OS Esc fullscreenchange events', async () => {
    await renderApp(payload('en'))
    const clRoot = container.querySelector('.cloth-lab-root')
    const reqMock = vi.fn().mockImplementation(async () => {
      document.fullscreenElement = clRoot
      document.dispatchEvent(new Event('fullscreenchange'))
    })
    const exitMock = vi.fn().mockImplementation(async () => {
      document.fullscreenElement = null
      document.dispatchEvent(new Event('fullscreenchange'))
    })
    clRoot.requestFullscreen = reqMock
    document.exitFullscreen = exitMock

    await act(async () => byTestId('cl-fullscreen-header-btn').click())
    expect(reqMock).toHaveBeenCalledTimes(1)
    expect(clRoot.classList.contains('is-fullscreen')).toBe(true)

    // Simulate OS pressing Esc directly (clears native fullscreenElement and fires fullscreenchange).
    await act(async () => {
      document.fullscreenElement = null
      document.dispatchEvent(new Event('fullscreenchange'))
    })
    expect(clRoot.classList.contains('is-fullscreen')).toBe(false)

    // If native requestFullscreen rejects, CSS viewport fullscreen still works cleanly.
    clRoot.requestFullscreen = vi.fn().mockRejectedValue(new Error('not allowed'))
    await act(async () => byTestId('cl-fullscreen-header-btn').click())
    expect(clRoot.classList.contains('is-fullscreen')).toBe(true)
  })
})
