import { FABRIC_IDS, FABRIC_PRESETS } from '../cloth/fabricPresets'
import { QUALITY_TIER_DEFAULT, QUALITY_TIER_HIGH } from '../cloth/ClothSimulation'
import { t } from '../i18n'
import {
  STITCH_STYLES,
  THREAD_COLOR_PRESETS,
  computeAutoContrastThreadHex,
  normalizeStitchConfig,
} from '../../../js/stitch-config.js'

const STITCH_STYLE_KEYS = {
  lockstitch: 'stitchLockstitch',
  twin: 'stitchTwin',
  zigzag: 'stitchZigzag',
  saddle: 'stitchSaddle',
}

// Live fabric switching — ClothSimulation.setFabric() only ever touches
// plain float uniforms (massDensity/stiffness/damping/friction), so this is
// an instant swap: no shader recompile, no texture rebuild, no sim restart.
export default function FabricPanel({
  lang = 'en',
  fabricId,
  onChange,
  qualityTier = QUALITY_TIER_DEFAULT,
  onQualityTierChange,
  stitchConfig = null,
  onStitchConfigChange,
  stitchParts = [],
  stitchPieces = [],
}) {
  const ar = lang === 'ar'
  const stCfg = normalizeStitchConfig(stitchConfig)
  const updateSt = (patch) => {
    if (!onStitchConfigChange) return
    onStitchConfigChange(normalizeStitchConfig({ ...stCfg, ...patch }))
  }

  return (
    <div style={{ padding: 14, borderTop: '1px solid var(--border)' }}>
      <div style={{ fontWeight: 700, fontSize: 12, color: 'var(--text-2)', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 10 }}>
        {t(lang, 'fabric')}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
        {FABRIC_IDS.map((id) => (
          <button
            key={id}
            onClick={() => onChange(id)}
            title={`massDensity ${FABRIC_PRESETS[id].massDensity}g/m², stiffness ${FABRIC_PRESETS[id].structStiff}, friction ${FABRIC_PRESETS[id].friction}`}
            style={{
              padding: '7px 8px', borderRadius: 8, border: '1px solid var(--border)', fontSize: 12.5, fontWeight: 600,
              background: id === fabricId ? 'var(--accent)' : 'var(--panel-2)',
              color: id === fabricId ? '#fff' : 'var(--text)',
            }}
          >
            {FABRIC_PRESETS[id].label}
          </button>
        ))}
      </div>
      {/* WP-35: opt-in high-quality tier. onQualityTierChange is optional
          (undefined for any caller that hasn't wired it up yet, e.g. an
          older embed integration) — the whole control hides rather than
          call a function that doesn't exist. */}
      {onQualityTierChange && (
        <div style={{ marginTop: 12 }}>
          <div style={{ fontSize: 11.5, color: 'var(--text-2)', marginBottom: 6 }} title={t(lang, 'simQualityHighHint')}>
            {t(lang, 'simQuality')}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
            {[QUALITY_TIER_DEFAULT, QUALITY_TIER_HIGH].map((tier) => (
              <button
                key={tier}
                onClick={() => onQualityTierChange(tier)}
                title={tier === QUALITY_TIER_HIGH ? t(lang, 'simQualityHighHint') : undefined}
                style={{
                  padding: '7px 8px', borderRadius: 8, border: '1px solid var(--border)', fontSize: 12.5, fontWeight: 600,
                  background: tier === qualityTier ? 'var(--accent)' : 'var(--panel-2)',
                  color: tier === qualityTier ? '#fff' : 'var(--text)',
                }}
              >
                {t(lang, tier === QUALITY_TIER_HIGH ? 'simQualityHigh' : 'simQualityDefault')}
              </button>
            ))}
          </div>
        </div>
      )}

      {onStitchConfigChange && (
        <div style={{ marginTop: 14, paddingTop: 12, borderTop: '1px solid var(--border)' }}>
          <div style={{ fontWeight: 700, fontSize: 12, color: 'var(--text-2)', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8 }}>
            {t(lang, 'stitchesTitle')}
          </div>

          <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12.5, fontWeight: 600, cursor: 'pointer', marginBottom: 10 }}>
            <input
              type="checkbox"
              checked={stCfg.enabled}
              onChange={(e) => updateSt({ enabled: e.target.checked })}
            />
            <span>{t(lang, 'enableStitches')}</span>
          </label>

          <div style={{ opacity: stCfg.enabled ? 1 : 0.55 }}>
            <div style={{ fontSize: 11.5, color: 'var(--text-2)', marginBottom: 5 }}>{t(lang, 'stitchStyle')}</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 5, marginBottom: 10 }}>
              {Object.keys(STITCH_STYLES).map((sid) => (
                <button
                  key={sid}
                  type="button"
                  onClick={() => updateSt({ enabled: true, style: sid })}
                  style={{
                    padding: '5px 7px', borderRadius: 7, border: '1px solid var(--border)', fontSize: 11.5, fontWeight: 600,
                    background: stCfg.style === sid ? 'var(--accent)' : 'var(--panel-2)',
                    color: stCfg.style === sid ? '#fff' : 'var(--text)',
                  }}
                >
                  {t(lang, STITCH_STYLE_KEYS[sid])}
                </button>
              ))}
            </div>

            <div style={{ fontSize: 11.5, color: 'var(--text-2)', marginBottom: 5 }}>{t(lang, 'stitchScope')}</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 5, marginBottom: 10 }}>
              {['external', 'all'].map((scopeId) => (
                <button
                  key={scopeId}
                  type="button"
                  onClick={() => updateSt({ visibility: scopeId })}
                  style={{
                    padding: '5px 7px', borderRadius: 7, border: '1px solid var(--border)', fontSize: 11.5, fontWeight: 600,
                    background: stCfg.visibility === scopeId ? 'var(--accent)' : 'var(--panel-2)',
                    color: stCfg.visibility === scopeId ? '#fff' : 'var(--text)',
                  }}
                >
                  {t(lang, scopeId === 'external' ? 'stitchScopeExternal' : 'stitchScopeAll')}
                </button>
              ))}
            </div>

            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
              <span style={{ fontSize: 11.5, color: 'var(--text-2)' }}>{t(lang, 'stitchGlobalColor')}</span>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <input
                  type="color"
                  aria-label={t(lang, 'stitchGlobalColor')}
                  value={stCfg.defaultColor}
                  onChange={(e) => updateSt({ enabled: true, autoContrast: false, defaultColor: e.target.value })}
                  style={{ width: 28, height: 22, padding: 0, border: '1px solid var(--border)', borderRadius: 5, background: 'transparent', cursor: 'pointer' }}
                />
                <label style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 11, color: 'var(--text-2)', cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={stCfg.autoContrast}
                    onChange={(e) => updateSt({ enabled: true, autoContrast: e.target.checked })}
                  />
                  <span>{t(lang, 'stitchAutoContrast')}</span>
                </label>
              </div>
            </div>

            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, marginBottom: 10 }}>
              {THREAD_COLOR_PRESETS.map((sw) => {
                const active = !stCfg.autoContrast && stCfg.defaultColor.toLowerCase() === sw.hex.toLowerCase()
                return (
                  <button
                    key={sw.hex}
                    type="button"
                    title={ar ? sw.label.ar : sw.label.en}
                    aria-label={ar ? sw.label.ar : sw.label.en}
                    onClick={() => updateSt({ enabled: true, autoContrast: false, defaultColor: sw.hex })}
                    style={{
                      width: 18, height: 18, borderRadius: '50%', padding: 0, cursor: 'pointer',
                      background: sw.hex,
                      border: active ? '2px solid var(--accent)' : '1px solid rgba(255,255,255,0.28)',
                    }}
                  />
                )
              })}
            </div>

            {stitchParts.length > 0 && (
              <div style={{ marginTop: 8 }}>
                <div style={{ fontSize: 11.5, color: 'var(--text-2)', marginBottom: 6 }}>{t(lang, 'stitchPerPart')}</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                  {stitchParts.map((part) => {
                    const pState = stCfg.parts[part.id] || { enabled: true, color: null }
                    const baseHex = part.baseColor || '#6d5efc'
                    const displayHex = pState.color || (stCfg.autoContrast ? computeAutoContrastThreadHex(baseHex) : stCfg.defaultColor)
                    return (
                      <div key={part.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6, padding: '4px 7px', borderRadius: 7, background: 'var(--panel-2)', border: '1px solid var(--border)' }}>
                        <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 600, cursor: 'pointer', flex: '1 1 auto', minWidth: 0 }}>
                          <input
                            type="checkbox"
                            checked={pState.enabled !== false}
                            onChange={(e) => updateSt({
                              parts: { ...stCfg.parts, [part.id]: { ...pState, enabled: e.target.checked } },
                            })}
                          />
                          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t(lang, `stitchPart_${part.id}`)}</span>
                        </label>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                          <input
                            type="color"
                            aria-label={t(lang, `stitchPart_${part.id}`)}
                            value={displayHex}
                            onChange={(e) => updateSt({
                              enabled: true,
                              parts: { ...stCfg.parts, [part.id]: { ...pState, enabled: true, color: e.target.value } },
                            })}
                            style={{ width: 24, height: 20, padding: 0, border: '1px solid var(--border)', borderRadius: 5, background: 'transparent', cursor: 'pointer' }}
                          />
                          {pState.color && (
                            <button
                              type="button"
                              onClick={() => updateSt({
                                parts: { ...stCfg.parts, [part.id]: { ...pState, color: null } },
                              })}
                              style={{ padding: '2px 5px', fontSize: 10, borderRadius: 5, border: '1px solid var(--border)', background: 'transparent', color: 'var(--text-2)', cursor: 'pointer' }}
                            >
                              {t(lang, 'stitchResetColor')}
                            </button>
                          )}
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}

            {stitchPieces.length > 0 && (
              <details style={{ marginTop: 10 }}>
                <summary style={{ fontSize: 11.5, color: 'var(--text-2)', cursor: 'pointer', userSelect: 'none' }}>
                  {t(lang, 'stitchPerPiece')} ({stitchPieces.length})
                </summary>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 5, marginTop: 6, maxHeight: 160, overflowY: 'auto' }}>
                  {stitchPieces.map((pc) => {
                    const pState = stCfg.parts[pc.partKey] || { color: null }
                    const ownCol = stCfg.pieceColors[pc.id]
                    const displayHex = ownCol || pState.color || (stCfg.autoContrast ? computeAutoContrastThreadHex(pc.color || '#6d5efc') : stCfg.defaultColor)
                    return (
                      <div key={pc.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6, padding: '3px 7px', borderRadius: 6, background: 'var(--panel-2)', border: '1px solid var(--border)' }}>
                        <span style={{ fontSize: 11.5, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: '1 1 auto' }}>
                          {pc.labelText}
                        </span>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                          <input
                            type="color"
                            aria-label={pc.labelText}
                            value={displayHex}
                            onChange={(e) => updateSt({
                              enabled: true,
                              pieceColors: { ...stCfg.pieceColors, [pc.id]: e.target.value },
                            })}
                            style={{ width: 22, height: 18, padding: 0, border: '1px solid var(--border)', borderRadius: 4, background: 'transparent', cursor: 'pointer' }}
                          />
                          {ownCol && (
                            <button
                              type="button"
                              onClick={() => {
                                const nextMap = { ...stCfg.pieceColors }
                                delete nextMap[pc.id]
                                updateSt({ pieceColors: nextMap })
                              }}
                              style={{ padding: '1px 5px', fontSize: 10, borderRadius: 4, border: '1px solid var(--border)', background: 'transparent', color: 'var(--text-2)', cursor: 'pointer' }}
                            >
                              {t(lang, 'stitchResetColor')}
                            </button>
                          )}
                        </div>
                      </div>
                    )
                  })}
                </div>
              </details>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
