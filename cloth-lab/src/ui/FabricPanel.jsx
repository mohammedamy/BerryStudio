import { FABRIC_IDS, FABRIC_PRESETS } from '../cloth/fabricPresets'
import { QUALITY_TIER_DEFAULT, QUALITY_TIER_HIGH } from '../cloth/ClothSimulation'
import { t } from '../i18n'

// Live fabric switching — ClothSimulation.setFabric() only ever touches
// plain float uniforms (massDensity/stiffness/damping/friction), so this is
// an instant swap: no shader recompile, no texture rebuild, no sim restart.
export default function FabricPanel({ lang = 'en', fabricId, onChange, qualityTier = QUALITY_TIER_DEFAULT, onQualityTierChange }) {
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
    </div>
  )
}
