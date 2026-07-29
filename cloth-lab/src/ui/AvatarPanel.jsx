import { SKIN_TONES } from '../body/skinTones'

export { DEFAULT_SKIN_TONE } from '../body/skinTones'

// WP-8.6: a preset skin-tone picker (was a single hardcoded '#e3b08c' in
// Avatar.jsx) — see body/skinTones.js for the actual table and why it's
// there rather than here.
export default function AvatarPanel({ skinTone, onChange }) {
  return (
    <div style={{ padding: 14, borderTop: '1px solid var(--border)' }}>
      <div style={{ fontWeight: 700, fontSize: 12, color: 'var(--text-2)', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 10 }}>
        Skin Tone
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: 6 }}>
        {SKIN_TONES.map((tone) => (
          <button
            key={tone.id}
            onClick={() => onChange(tone.id)}
            title={tone.label}
            aria-label={tone.label}
            style={{
              width: 28, height: 28, borderRadius: '50%', padding: 0, cursor: 'pointer',
              background: tone.hex,
              border: tone.id === skinTone ? '2px solid var(--accent)' : '1px solid var(--border)',
              boxShadow: tone.id === skinTone ? '0 0 0 2px var(--panel)' : 'none',
            }}
          />
        ))}
      </div>
    </div>
  )
}
