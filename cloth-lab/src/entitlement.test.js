import { describe, it, expect } from 'vitest'
import { computeEntitlement, isAllowed, TRIAL_DAYS } from './entitlement.js'

// Mirrors test/entitlement.test.js's cases (root app) — this file's
// computeEntitlement/isAllowed are a hand-kept-in-sync duplicate (see
// entitlement.js's own header comment), so the same cases are re-asserted
// here to catch either copy drifting from the other.

const DAY = 24 * 60 * 60 * 1000
const NOW = Date.UTC(2026, 7, 11)

describe('computeEntitlement', () => {
  it('no profile is treated as expired', () => {
    expect(computeEntitlement(null, NOW).status).toBe('expired')
    expect(computeEntitlement(undefined, NOW).status).toBe('expired')
    expect(computeEntitlement({}, NOW).status).toBe('expired')
  })

  it('active always wins regardless of trial age', () => {
    const r = computeEntitlement({ subscriptionStatus: 'active', trialStartedAt: NOW - 400 * DAY }, NOW)
    expect(r.status).toBe('active')
    expect(r.allowed).toBe(true)
  })

  it('active wins even with no trialStartedAt', () => {
    const r = computeEntitlement({ subscriptionStatus: 'active' }, NOW)
    expect(r.status).toBe('active')
  })

  it('trial just started is fully allowed', () => {
    const r = computeEntitlement({ subscriptionStatus: 'trial', trialStartedAt: NOW }, NOW)
    expect(r.status).toBe('trial')
    expect(r.allowed).toBe(true)
    expect(r.daysRemaining).toBe(TRIAL_DAYS)
  })

  it('trial exactly at its 30-day boundary is expired', () => {
    const r = computeEntitlement({ subscriptionStatus: 'trial', trialStartedAt: NOW - TRIAL_DAYS * DAY }, NOW)
    expect(r.status).toBe('expired')
    expect(r.allowed).toBe(false)
  })

  it('malformed trialStartedAt is expired, not a throw', () => {
    const r = computeEntitlement({ subscriptionStatus: 'trial', trialStartedAt: 'nope' }, NOW)
    expect(r.status).toBe('expired')
  })
})

describe('isAllowed', () => {
  it('folds null/undefined to false', () => {
    expect(isAllowed(null)).toBe(false)
    expect(isAllowed(undefined)).toBe(false)
    expect(isAllowed({ allowed: true })).toBe(true)
  })
})
