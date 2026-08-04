import { SKIN_TONES } from '../body/skinTones'
import { t } from '../i18n'

export { DEFAULT_SKIN_TONE } from '../body/skinTones'

export const DEFAULT_POSE = 'standing'
// WP-8.5: A-pose/T-pose/contrapposto are rotation-only variants on both the
// procedural avatar (Avatar.jsx) and a recognized GLB rig (reposeGLB.js).
// Seated bends the knee (a real geometry change, not just a rotation) on
// the procedural avatar; on a GLB it needs the leg rig recognized too, and
// falls back to standing legs (with a console warning) otherwise. Walk only
// ever does anything for a GLB that ships its own embedded animation clip —
// the procedural avatar has no skeleton to animate, so it stays in the
// standing pose for `walk` (an honest no-op, not a crash).
export const POSES = [
  { id: 'standing', label: 'Standing' },
  { id: 'apose', label: 'A-pose' },
  { id: 'tpose', label: 'T-pose' },
  { id: 'contrapposto', label: 'Contrapposto' },
  { id: 'seated', label: 'Seated' },
  { id: 'walk', label: 'Walk' },
]

// WP-8.6: a preset skin-tone picker (was a single hardcoded '#e3b08c' in
// Avatar.jsx) — see body/skinTones.js for the actual table and why it's
// there rather than here.
const POSE_I18N_KEYS = {
  standing: 'pose_standing', apose: 'pose_apose', tpose: 'pose_tpose',
  contrapposto: 'pose_contrapposto', seated: 'pose_seated', walk: 'pose_walk',
}

export default function AvatarPanel({ lang = 'en', skinTone, onChange, pose, onPoseChange }) {
  return (
    <div style={{ padding: 14, borderTop: '1px solid var(--border)' }}>
      <div style={{ fontWeight: 700, fontSize: 12, color: 'var(--text-2)', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 10 }}>
        {t(lang, 'skinTone')}
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
      {onPoseChange && (
        <>
          <div style={{ fontWeight: 700, fontSize: 12, color: 'var(--text-2)', textTransform: 'uppercase', letterSpacing: 0.5, margin: '14px 0 10px' }}>
            {t(lang, 'pose')}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
            {POSES.map((p) => (
              <button
                key={p.id}
                onClick={() => onPoseChange(p.id)}
                style={{
                  padding: '6px 8px', borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: 'pointer',
                  background: p.id === pose ? 'var(--accent-2)' : 'var(--panel-2)',
                  color: p.id === pose ? '#fff' : 'var(--text)',
                  border: '1px solid var(--border)',
                }}
              >
                {t(lang, POSE_I18N_KEYS[p.id])}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  )
}
