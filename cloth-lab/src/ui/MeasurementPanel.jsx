import { MEASUREMENT_KEYS, MEASUREMENT_LABELS } from '../state/measurements'

// Live measurement input panel — every change flows straight into
// computeBodyDims() upstream, so the avatar (and later the cloth's collision
// rig) re-morphs in real time as the user types.
export default function MeasurementPanel({ measurements, onChange }) {
  return (
    <div style={{ padding: 14 }}>
      <div style={{ fontWeight: 700, fontSize: 12, color: 'var(--text-2)', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 10 }}>
        Body Measurements (cm)
      </div>
      {MEASUREMENT_KEYS.map((k) => (
        <label key={k} style={{ display: 'grid', gridTemplateColumns: '1fr 64px', alignItems: 'center', gap: 8, padding: '5px 0' }}>
          <span style={{ fontSize: 12.5 }}>{MEASUREMENT_LABELS[k]}</span>
          <input
            type="number"
            value={measurements[k]}
            onChange={(e) => onChange({ ...measurements, [k]: +e.target.value || 0 })}
            style={{
              width: '100%', padding: '5px 7px', borderRadius: 6, border: '1px solid var(--border)',
              background: 'var(--panel-2)', color: 'var(--text)', textAlign: 'center', fontWeight: 700,
            }}
          />
        </label>
      ))}
    </div>
  )
}
