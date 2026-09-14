import { designKey } from './patternPlan'
const storageKey = source => `berrystudio:cloth-workflow:${source?.designId || 'standalone'}`
export function readSession(source) {
  try {
    const saved = JSON.parse(window.localStorage.getItem(storageKey(source)) || 'null')
    return saved?.design === designKey(source) ? saved : null
  } catch { return null }
}
export function writeSession(source, state) {
  try { window.localStorage.setItem(storageKey(source), JSON.stringify({ ...state, design: designKey(source) })); return true }
  catch { return false }
}
