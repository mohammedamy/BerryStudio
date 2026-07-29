import { describe, it, expect } from 'vitest'
import { detectVRM } from './reposeGLB.js'

describe('detectVRM', () => {
  it('detects VRM 0.x via the "VRM" extension', () => {
    expect(detectVRM({ parser: { json: { extensionsUsed: ['VRM'] } } })).toBe(true)
  })

  it('detects VRM 1.0 via the "VRMC_vrm" extension', () => {
    expect(detectVRM({ parser: { json: { extensionsUsed: ['VRMC_vrm', 'KHR_materials_emissive_strength'] } } })).toBe(true)
  })

  it('returns false for a plain Mixamo/RPM glTF with no VRM extension', () => {
    expect(detectVRM({ parser: { json: { extensionsUsed: ['KHR_materials_unlit'] } } })).toBe(false)
  })

  it('returns false when extensionsUsed is missing entirely', () => {
    expect(detectVRM({ parser: { json: {} } })).toBe(false)
    expect(detectVRM({})).toBe(false)
    expect(detectVRM(null)).toBe(false)
  })
})
