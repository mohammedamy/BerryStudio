import { describe, it, expect } from 'vitest'
import { bitonicPassSequence } from './bitonicSortGPU.js'

// Only the pure-JS pass-sequence generator is unit-testable outside a real
// WebGL2 context — the actual GPU passes (CELL_ID_FRAGMENT_SHADER,
// COMPARE_EXCHANGE_FRAGMENT_SHADER) are verified live in the browser (see
// README's WP-35b honest note) against spatialHash.js's already-verified
// CPU reference, which this sequence must match pass-for-pass.
describe('bitonicPassSequence', () => {
  it('produces log2(P)*(log2(P)+1)/2 total passes', () => {
    for (const p of [2, 4, 8, 16, 64, 4096, 16384]) {
      const log2p = Math.log2(p)
      const expected = (log2p * (log2p + 1)) / 2
      expect(bitonicPassSequence(p).length).toBe(expected)
    }
  })

  it('matches the known hand-worked sequence for P=8', () => {
    expect(bitonicPassSequence(8)).toEqual([
      { k: 2, j: 1 },
      { k: 4, j: 2 }, { k: 4, j: 1 },
      { k: 8, j: 4 }, { k: 8, j: 2 }, { k: 8, j: 1 },
    ])
  })

  it('every pass has 1 <= j <= k/2 and k a power of two up to P', () => {
    for (const { k, j } of bitonicPassSequence(1024)) {
      expect(Math.log2(k) % 1).toBe(0)
      expect(k).toBeLessThanOrEqual(1024)
      expect(j).toBeGreaterThanOrEqual(1)
      expect(j).toBeLessThanOrEqual(k >> 1)
    }
  })
})
