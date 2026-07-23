import { CATEGORIES } from '../state/measurements'

const LABELS = { women: 'Women', men: 'Men', girls: 'Girls', boys: 'Boys' }
const DEBUG_VIEWS = [
  { id: 'off', label: 'Off', title: 'No pattern-piece debug overlay' },
  { id: 'pieces', label: 'Pieces', title: 'Per-piece flat-color static placement (no physics)' },
  { id: 'weld', label: 'Weld', title: 'Weld-degree overlay: grey=unwelded, green=seam, red=multi-piece corner' },
  { id: 'cloth', label: 'Cloth', title: 'Live GPU cloth simulation (structural + bend, no body collision yet)' },
]

export default function Header({ category, onCategoryChange, debugView, onDebugViewChange }) {
  return (
    <header
      style={{
        display: 'flex', alignItems: 'center', gap: 16, padding: '10px 16px',
        borderBottom: '1px solid var(--border)', background: 'var(--panel)', flex: '0 0 auto',
      }}
    >
      <strong style={{ fontSize: 15 }}>BerryStudio 3D — Cloth Lab</strong>
      <div style={{ display: 'flex', gap: 4 }}>
        {DEBUG_VIEWS.map((v) => (
          <button
            key={v.id}
            onClick={() => onDebugViewChange(v.id)}
            title={v.title}
            style={{
              padding: '6px 12px', borderRadius: 999, border: '1px solid var(--border)', fontSize: 13,
              background: v.id === debugView ? 'var(--accent-2)' : 'var(--panel-2)',
              color: v.id === debugView ? '#fff' : 'var(--text-2)',
            }}
          >
            {v.label}
          </button>
        ))}
      </div>
      <div style={{ display: 'flex', gap: 4, marginInlineStart: 'auto' }}>
        {CATEGORIES.map((c) => (
          <button
            key={c}
            onClick={() => onCategoryChange(c)}
            style={{
              padding: '6px 14px', borderRadius: 999, border: '1px solid var(--border)',
              background: c === category ? 'var(--accent)' : 'var(--panel-2)',
              color: c === category ? '#fff' : 'var(--text)',
            }}
          >
            {LABELS[c]}
          </button>
        ))}
      </div>
    </header>
  )
}
