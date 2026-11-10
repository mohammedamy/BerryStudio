import { useMemo, useState } from 'react'
import { createRoot } from 'react-dom/client'
import App from '../src/App.jsx'
import '../src/index.css'
import { PATTERNS } from '../../js/data.js'
import '../../js/library.js'

const WOMEN_M = {
  chest: 92, waist: 74, hips: 100, shoulder: 40, backLen: 40,
  sleeve: 58, neck: 36, bicep: 28, inseam: 76, thigh: 56, height: 165,
}

function buildDressPayload(lang) {
  const pcs = PATTERNS.w001 ? PATTERNS.w001.pieces(WOMEN_M) : PATTERNS.womens_dress.pieces(WOMEN_M)
  return {
    designId: 'e2e-sleeved-dress',
    designName: lang === 'ar' ? 'بلوزة كلاسيكية بأكمام طويلة' : 'Classic Long-Sleeve Top',
    type: 'berrystudio:pattern',
    measurements: WOMEN_M,
    category: 'women',
    fabricId: 'cotton',
    lang,
    pieces: pcs.map((p, i) => ({
      id: (p.key || 'piece') + '_' + i,
      visible: true,
      label: p.name,
      outline: p.outline,
      curves: p.curves || p.outline?.curves,
      darts: p.darts,
      role: p.role,
      cutOnFold: p.cutOnFold,
      bilateral: p.bilateral,
      edges: p.edges,
      princessSeamId: p.princessSeamId,
      necklineEndIdx: p.necklineEndIdx,
      sideEndIdx: p.sideEndIdx,
      color: p.color || (i === 0 ? '#5b8cff' : i === 1 ? '#6e7bf2' : '#f28b66'),
    })),
  }
}

export function SleeveFixture() {
  const params = new URLSearchParams(window.location.search)
  const [lang] = useState(params.get('lang') || 'ar')
  const pattern = useMemo(() => buildDressPayload(lang), [lang])
  return <div style={{ width: '100vw', height: '100vh', display: 'flex' }}>
    <App embedded pattern={pattern} />
  </div>
}

createRoot(document.getElementById('root')).render(<SleeveFixture />)
