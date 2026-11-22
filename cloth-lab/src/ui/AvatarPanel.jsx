import { SKIN_TONES } from '../body/skinTones'
import { getMannequinsByCategory, isActiveMannequinSize, normalizeMannequinSize } from '../../../js/mannequin-catalog.js'
import {
  HAIR_TYPES,
  HAIR_LENGTH_PRESETS,
  HAIR_HIGHLIGHT_PRESETS,
  HAIR_COLOR_PRESETS,
  HEADWEAR_COLOR_PRESETS,
  HEADWEAR_FABRIC_PRESETS,
  HEADWEAR_LENGTH_PRESETS,
  UNDERCAP_COLOR_PRESETS,
  getHaircutsForCategory,
  getHeadwearForCategory,
  getHeadwearSpec,
} from '../../../js/mannequin-styling.js'
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

export default function AvatarPanel({ lang = 'en', category = 'women', mannequinSize = 'M', onMannequinSizeChange, styling = null, onStylingChange = null, skinTone, onChange, pose, onPoseChange }) {
  const mannequins = getMannequinsByCategory(category)
  const haircuts = getHaircutsForCategory(category)
  const longCuts = haircuts.filter((c) => c.group === 'long')
  const classicCuts = haircuts.filter((c) => c.group !== 'long')
  const headwearList = getHeadwearForCategory(category)
  const ar = lang === 'ar'
  const femaleCat = category === 'women' || category === 'girls'
  const activeHeadwear = styling?.headwear || 'none'
  const hwSpec = getHeadwearSpec(activeHeadwear)
  const showHeadwearColor = activeHeadwear !== 'none' && Boolean(onStylingChange)
  const labelStyle = { fontWeight: 700, fontSize: 12, color: 'var(--text-2)', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 6 }
  const pillStyle = (active) => ({
    padding: '5px 6px', borderRadius: 7, fontSize: 11, fontWeight: 600, cursor: 'pointer',
    background: active ? 'var(--accent-2)' : 'var(--panel-2)',
    color: active ? '#fff' : 'var(--text)',
    border: '1px solid var(--border)',
  })
  return (
    <div style={{ padding: 14, borderTop: '1px solid var(--border)' }}>
      {onMannequinSizeChange && (
        <div style={{ marginBottom: 14, paddingBottom: 12, borderBottom: '1px solid var(--border)' }}>
          <div style={{ fontWeight: 700, fontSize: 12, color: 'var(--text-2)', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4 }}>
            {t(lang, 'mannequinSize')}
          </div>
          <div style={{ fontSize: 11, color: 'var(--text-2)', marginBottom: 8 }}>
            {t(lang, 'mannequinPresetHint')}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 6 }}>
            {mannequins.map((mq) => {
              const active = isActiveMannequinSize(mannequinSize) && mq.size === normalizeMannequinSize(mannequinSize)
              return (
                <button
                  key={mq.id}
                  type="button"
                  aria-pressed={active}
                  onClick={() => onMannequinSizeChange(mq.size)}
                  title={`${ar ? mq.name.ar : mq.name.en} — ${mq.measurements.height} cm`}
                  style={{
                    padding: '6px 6px',
                    borderRadius: 8,
                    fontSize: 11,
                    fontWeight: 700,
                    cursor: 'pointer',
                    textAlign: 'center',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    gap: 2,
                    background: active ? 'var(--accent-2)' : 'var(--panel-2)',
                    color: active ? '#fff' : 'var(--text)',
                    border: active ? '1px solid var(--accent)' : '1px solid var(--border)',
                  }}
                >
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                    <span style={{ width: 8, height: 8, borderRadius: '50%', background: mq.skinHex, border: '1px solid rgba(0,0,0,0.25)' }} />
                    <span>{mq.size}</span>
                  </span>
                  <span style={{ fontSize: 9.5, opacity: 0.84, fontWeight: 600 }}>{mq.measurements.height} {ar ? 'سم' : 'cm'}</span>
                </button>
              )
            })}
          </div>
          <div style={{ fontSize: 10, color: 'var(--text-2)', marginTop: 6, textAlign: 'center' }}>
            {t(lang, 'mannequinFutureShort')}
          </div>
        </div>
      )}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
        <div style={{ fontWeight: 700, fontSize: 12, color: 'var(--text-2)', textTransform: 'uppercase', letterSpacing: 0.5 }}>
          {t(lang, 'skinTone')}
        </div>
        {skinTone != null && (
          <button
            type="button"
            onClick={() => onChange(null)}
            style={{ background: 'none', border: 'none', color: 'var(--accent)', fontSize: 11, fontWeight: 700, cursor: 'pointer', padding: 0 }}
          >
            {t(lang, 'skinAuto')}
          </button>
        )}
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
      {onStylingChange && styling && (
        <div style={{ marginTop: 14, paddingTop: 12, borderTop: '1px solid var(--border)' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
            <div style={{ fontWeight: 700, fontSize: 12, color: 'var(--text-2)', textTransform: 'uppercase', letterSpacing: 0.5 }}>
              {t(lang, 'haircutStyle')}
            </div>
            {styling.hasOverrides && (
              <button
                type="button"
                onClick={() => onStylingChange(null)}
                style={{ background: 'none', border: 'none', color: 'var(--accent)', fontSize: 11, fontWeight: 700, cursor: 'pointer', padding: 0 }}
              >
                {t(lang, 'stylingReset')}
              </button>
            )}
          </div>
          <select
            aria-label={t(lang, 'haircutStyle')}
            value={styling.hairStyle}
            onChange={(e) => onStylingChange({ hairStyle: e.target.value })}
            style={{ width: '100%', padding: '6px 8px', borderRadius: 8, background: 'var(--panel-2)', color: 'var(--text)', border: '1px solid var(--border)', fontSize: 12, marginBottom: 10 }}
          >
            {longCuts.length > 0 && (
              <optgroup label={t(lang, 'stylingGroupLongHair')}>
                {longCuts.map((c) => (
                  <option key={c.id} value={c.id}>{ar ? c.label.ar : c.label.en}</option>
                ))}
              </optgroup>
            )}
            <optgroup label={t(lang, 'stylingGroupClassicHair')}>
              {classicCuts.map((c) => (
                <option key={c.id} value={c.id}>{ar ? c.label.ar : c.label.en}</option>
              ))}
            </optgroup>
          </select>

          <div style={labelStyle}>{t(lang, 'hairLength')}</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 4, marginBottom: 10 }}>
            {HAIR_LENGTH_PRESETS.map((hl) => {
              const active = styling.hairLength === hl.id
              return (
                <button
                  key={hl.id}
                  type="button"
                  aria-pressed={active}
                  onClick={() => onStylingChange({ hairLength: hl.id })}
                  style={pillStyle(active)}
                >
                  {ar ? hl.label.ar : hl.label.en}
                </button>
              )
            })}
          </div>

          <div style={labelStyle}>{t(lang, 'hairType')}</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 5, marginBottom: 10 }}>
            {HAIR_TYPES.map((ht) => {
              const active = styling.hairType === ht.id
              return (
                <button
                  key={ht.id}
                  type="button"
                  aria-pressed={active}
                  onClick={() => onStylingChange({ hairType: ht.id })}
                  style={pillStyle(active)}
                >
                  {ar ? ht.label.ar : ht.label.en}
                </button>
              )
            })}
          </div>

          <div style={labelStyle}>{t(lang, 'hairColor')}</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 5, alignItems: 'center', marginBottom: 10 }}>
            {HAIR_COLOR_PRESETS.slice(0, 12).map((sw) => (
              <button
                key={sw.id}
                type="button"
                onClick={() => onStylingChange({ hairColor: sw.hex })}
                title={ar ? sw.label.ar : sw.label.en}
                aria-label={ar ? sw.label.ar : sw.label.en}
                style={{
                  width: 24, height: 24, borderRadius: '50%', padding: 0, cursor: 'pointer',
                  background: sw.hex,
                  border: styling.hairHex === sw.hex ? '2px solid var(--accent)' : '1px solid var(--border)',
                }}
              />
            ))}
            <input
              type="color"
              aria-label={t(lang, 'hairColor')}
              value={styling.hairHex || '#241913'}
              onChange={(e) => onStylingChange({ hairColor: e.target.value })}
              style={{ width: 24, height: 24, padding: 0, border: '1px solid var(--border)', borderRadius: 6, background: 'transparent', cursor: 'pointer' }}
            />
          </div>

          <div style={labelStyle}>{t(lang, 'hairHighlight')}</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 5, alignItems: 'center', marginBottom: 12 }}>
            {HAIR_HIGHLIGHT_PRESETS.map((hh) => {
              const active = styling.hairHighlight === hh.id
              return hh.hex ? (
                <button
                  key={hh.id}
                  type="button"
                  onClick={() => onStylingChange({ hairHighlight: hh.id })}
                  title={ar ? hh.label.ar : hh.label.en}
                  aria-label={ar ? hh.label.ar : hh.label.en}
                  style={{
                    width: 24, height: 24, borderRadius: '50%', padding: 0, cursor: 'pointer',
                    background: hh.hex,
                    border: active ? '2px solid var(--accent)' : '1px solid var(--border)',
                  }}
                />
              ) : (
                <button
                  key={hh.id}
                  type="button"
                  aria-pressed={active}
                  onClick={() => onStylingChange({ hairHighlight: 'none' })}
                  title={ar ? hh.label.ar : hh.label.en}
                  style={{
                    ...pillStyle(active),
                    fontSize: 9.5,
                    padding: '4px 3px',
                  }}
                >
                  {t(lang, 'stylingAuto')}
                </button>
              )
            })}
          </div>

          <div style={labelStyle}>{t(lang, 'headwearStyle')}</div>
          <select
            aria-label={t(lang, 'headwearStyle')}
            value={activeHeadwear}
            onChange={(e) => onStylingChange({
              headwear: e.target.value,
              headwearColor: null,
              headwearFabric: null,
              headwearLength: null,
              undercapColor: null,
              niqabEyeScreen: null,
            })}
            style={{ width: '100%', padding: '6px 8px', borderRadius: 8, background: 'var(--panel-2)', color: 'var(--text)', border: '1px solid var(--border)', fontSize: 12, marginBottom: showHeadwearColor ? 10 : 0 }}
          >
            {femaleCat ? (
              <>
                {headwearList.filter((h) => h.id === 'none').map((hw) => (
                  <option key={hw.id} value={hw.id}>{ar ? hw.label.ar : hw.label.en}</option>
                ))}
                <optgroup label={t(lang, 'stylingGroupHijabs')}>
                  {headwearList.filter((h) => h.group === 'hijab').map((hw) => (
                    <option key={hw.id} value={hw.id}>{ar ? hw.label.ar : hw.label.en}</option>
                  ))}
                </optgroup>
                <optgroup label={t(lang, 'stylingGroupNiqabs')}>
                  {headwearList.filter((h) => h.group === 'niqab').map((hw) => (
                    <option key={hw.id} value={hw.id}>{ar ? hw.label.ar : hw.label.en}</option>
                  ))}
                </optgroup>
                <optgroup label={t(lang, 'stylingGroupHats')}>
                  {headwearList.filter((h) => h.group === 'hat').map((hw) => (
                    <option key={hw.id} value={hw.id}>{ar ? hw.label.ar : hw.label.en}</option>
                  ))}
                </optgroup>
              </>
            ) : (
              headwearList.map((hw) => (
                <option key={hw.id} value={hw.id}>{ar ? hw.label.ar : hw.label.en}</option>
              ))
            )}
          </select>

          {showHeadwearColor && (
            <>
              <div style={labelStyle}>{t(lang, 'headwearColor')}</div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 5, alignItems: 'center', marginBottom: 10 }}>
                {HEADWEAR_COLOR_PRESETS.slice(0, 12).map((sw) => (
                  <button
                    key={sw.id}
                    type="button"
                    onClick={() => onStylingChange({ headwearColor: sw.hex })}
                    title={ar ? sw.label.ar : sw.label.en}
                    aria-label={ar ? sw.label.ar : sw.label.en}
                    style={{
                      width: 24, height: 24, borderRadius: '50%', padding: 0, cursor: 'pointer',
                      background: sw.hex,
                      border: styling.headwearHex === sw.hex ? '2px solid var(--accent)' : '1px solid var(--border)',
                    }}
                  />
                ))}
                <input
                  type="color"
                  aria-label={t(lang, 'headwearColor')}
                  value={styling.headwearHex || '#f3ece4'}
                  onChange={(e) => onStylingChange({ headwearColor: e.target.value })}
                  style={{ width: 24, height: 24, padding: 0, border: '1px solid var(--border)', borderRadius: 6, background: 'transparent', cursor: 'pointer' }}
                />
              </div>

              {hwSpec.supportsFabric && (
                <>
                  <div style={labelStyle}>{t(lang, 'headwearFabric')}</div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 5, marginBottom: 10 }}>
                    {HEADWEAR_FABRIC_PRESETS.map((fb) => {
                      const active = styling.headwearFabric === fb.id
                      return (
                        <button
                          key={fb.id}
                          type="button"
                          aria-pressed={active}
                          onClick={() => onStylingChange({ headwearFabric: fb.id })}
                          style={pillStyle(active)}
                        >
                          {ar ? fb.label.ar : fb.label.en}
                        </button>
                      )
                    })}
                  </div>
                </>
              )}

              {hwSpec.supportsLength && (
                <>
                  <div style={labelStyle}>{t(lang, 'headwearLength')}</div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 5, marginBottom: 10 }}>
                    {HEADWEAR_LENGTH_PRESETS.map((hl) => {
                      const active = styling.headwearLength === hl.id
                      return (
                        <button
                          key={hl.id}
                          type="button"
                          aria-pressed={active}
                          onClick={() => onStylingChange({ headwearLength: hl.id })}
                          style={pillStyle(active)}
                        >
                          {ar ? hl.label.ar : hl.label.en}
                        </button>
                      )
                    })}
                  </div>
                </>
              )}

              {hwSpec.supportsUndercap && (
                <>
                  <div style={labelStyle}>{t(lang, 'undercapColor')}</div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(9, 1fr)', gap: 4, alignItems: 'center', marginBottom: 10 }}>
                    {UNDERCAP_COLOR_PRESETS.slice(0, 8).map((sw) => (
                      <button
                        key={sw.id}
                        type="button"
                        onClick={() => onStylingChange({ undercapColor: sw.hex })}
                        title={ar ? sw.label.ar : sw.label.en}
                        aria-label={ar ? sw.label.ar : sw.label.en}
                        style={{
                          width: 22, height: 22, borderRadius: '50%', padding: 0, cursor: 'pointer',
                          background: sw.hex,
                          border: styling.undercapHex === sw.hex ? '2px solid var(--accent)' : '1px solid var(--border)',
                        }}
                      />
                    ))}
                    <input
                      type="color"
                      aria-label={t(lang, 'undercapColor')}
                      value={styling.undercapHex || '#18191e'}
                      onChange={(e) => onStylingChange({ undercapColor: e.target.value })}
                      style={{ width: 22, height: 22, padding: 0, border: '1px solid var(--border)', borderRadius: 6, background: 'transparent', cursor: 'pointer' }}
                    />
                  </div>
                </>
              )}

              {hwSpec.isNiqab && (
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '6px 8px', borderRadius: 8, background: 'var(--panel-2)', border: '1px solid var(--border)' }}>
                  <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--text)' }}>{t(lang, 'niqabEyeScreen')}</span>
                  <button
                    type="button"
                    aria-pressed={Boolean(styling.niqabEyeScreen)}
                    onClick={() => onStylingChange({ niqabEyeScreen: !styling.niqabEyeScreen })}
                    style={{
                      padding: '4px 10px', borderRadius: 999, fontSize: 11, fontWeight: 700, cursor: 'pointer',
                      background: styling.niqabEyeScreen ? 'var(--accent-2)' : 'var(--panel)',
                      color: styling.niqabEyeScreen ? '#fff' : 'var(--text)',
                      border: '1px solid var(--border)',
                    }}
                  >
                    {styling.niqabEyeScreen ? t(lang, 'stylingOn') : t(lang, 'stylingOff')}
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      )}
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
