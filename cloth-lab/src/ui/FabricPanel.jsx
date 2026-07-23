import { FABRIC_IDS, FABRIC_SIM_PRESETS } from '../cloth/fabricPresets'

const LABELS = {
  chiffon: 'Chiffon', silk: 'Silk', satin: 'Satin', cotton: 'Cotton',
  linen: 'Linen', wool: 'Wool', denim: 'Denim', leather: 'Leather',
}

// Live fabric switching — ClothSimulation.setFabric() only ever touches
// plain float uniforms (massDensity/stiffness/damping/friction), so this is
// an instant swap: no shader recompile, no texture rebuild, no sim restart.
export default function FabricPanel({ fabricId, onChange }) {
  return (
    <div style={{ padding: 14, borderTop: '1px solid var(--border)' }}>
      <div style={{ fontWeight: 700, fontSize: 12, color: 'var(--text-2)', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 10 }}>
        Fabric
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
        {FABRIC_IDS.map((id) => (
          <button
            key={id}
            onClick={() => onChange(id)}
            title={`massDensity ${FABRIC_SIM_PRESETS[id].massDensity}g/m², stiffness ${FABRIC_SIM_PRESETS[id].structStiff}, friction ${FABRIC_SIM_PRESETS[id].friction}`}
            style={{
              padding: '7px 8px', borderRadius: 8, border: '1px solid var(--border)', fontSize: 12.5, fontWeight: 600,
              background: id === fabricId ? 'var(--accent)' : 'var(--panel-2)',
              color: id === fabricId ? '#fff' : 'var(--text)',
            }}
          >
            {LABELS[id]}
          </button>
        ))}
      </div>
    </div>
  )
}
