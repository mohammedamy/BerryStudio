import { describe, it, expect } from 'vitest'
import { resolveSchemaRole, zoneForRole, SCHEMA_ROLE_INFO } from './roles.js'

// WP-49: body-zone metadata added to the panel-shaped roles — these tests
// exist specifically to catch a role's zone drifting out of sync with its
// placement family (e.g. a role that places via hipPanelFront/Back but
// isn't tagged zone:'lower'), and to lock in the brief-front/brief-back
// bug fix (see roles.js's own header comment on those two entries).

describe('zoneForRole', () => {
  it('brief-front/brief-back resolve to lower (the confirmed WP-43 bug fix)', () => {
    expect(zoneForRole('brief-front')).toBe('lower')
    expect(zoneForRole('brief-back')).toBe('lower')
  })

  it('every hip-panel/gore/skirt-* placement role is zoned lower', () => {
    for (const [role, info] of Object.entries(SCHEMA_ROLE_INFO)) {
      if (['hipPanelFront', 'hipPanelBack', 'goreFront', 'goreBack', 'goreSideLeft', 'goreSideRight'].includes(info.placement)) {
        expect(zoneForRole(role), `role "${role}" (placement ${info.placement})`).toBe('lower')
      }
    }
  })

  it('every frontPanel/backPanel/sleeve placement role is zoned upper', () => {
    for (const [role, info] of Object.entries(SCHEMA_ROLE_INFO)) {
      if (['frontPanel', 'backPanel', 'sleeve'].includes(info.placement)) {
        expect(zoneForRole(role), `role "${role}" (placement ${info.placement})`).toBe('upper')
      }
    }
  })

  it('accessory/attach roles are deliberately unzoned (reused across garment types)', () => {
    for (const role of ['waistband', 'collar', 'cuff', 'pocket', 'gusset' in SCHEMA_ROLE_INFO ? 'gusset' : 'pocket', 'other']) {
      expect(zoneForRole(role)).toBeNull()
    }
  })

  it('unknown/undeclared roles resolve to null, not a throw', () => {
    expect(zoneForRole('not-a-real-role')).toBeNull()
    expect(zoneForRole(undefined)).toBeNull()
    expect(zoneForRole(null)).toBeNull()
  })

  it('legacy-aliased roles (bodice-front, skirt-front, ...) resolve zone through the alias', () => {
    expect(zoneForRole('bodice-front')).toBe('upper')
    expect(zoneForRole('skirt-front')).toBe('lower')
  })
})

describe('resolveSchemaRole', () => {
  it('brief-front resolves to the hipPanelFront placement family', () => {
    const r = resolveSchemaRole('brief-front')
    expect(r.placement).toBe('hipPanelFront')
    expect(r.zone).toBe('lower')
  })
})
