import test from 'node:test';
import assert from 'node:assert/strict';
import { computeEntitlement, isAllowed, TRIAL_DAYS } from '../js/entitlement.js';

const DAY = 24 * 60 * 60 * 1000;
const NOW = Date.UTC(2026, 7, 11); // 2026-08-11, matches this session's real date

test('no profile at all (fetch failed / no row / migration not run) is treated as expired', () => {
  assert.equal(computeEntitlement(null, NOW).status, 'expired');
  assert.equal(computeEntitlement(undefined, NOW).status, 'expired');
  assert.equal(computeEntitlement({}, NOW).status, 'expired');
  assert.equal(isAllowed(computeEntitlement(null, NOW)), false);
});

test('active status always wins, regardless of trial age', () => {
  const longAgo = NOW - 400 * DAY;
  const r = computeEntitlement({ subscriptionStatus: 'active', trialStartedAt: longAgo }, NOW);
  assert.equal(r.status, 'active');
  assert.equal(r.allowed, true);
  assert.equal(r.daysRemaining, null);
});

test('active status wins even with no trialStartedAt at all', () => {
  const r = computeEntitlement({ subscriptionStatus: 'active' }, NOW);
  assert.equal(r.status, 'active');
  assert.equal(r.allowed, true);
});

test('trial just started: full days remaining, allowed', () => {
  const r = computeEntitlement({ subscriptionStatus: 'trial', trialStartedAt: NOW }, NOW);
  assert.equal(r.status, 'trial');
  assert.equal(r.allowed, true);
  assert.equal(r.daysRemaining, TRIAL_DAYS);
});

test('trial 30 minutes old still reads as the full trial length, not day 0', () => {
  const startedAt = NOW - 30 * 60 * 1000;
  const r = computeEntitlement({ subscriptionStatus: 'trial', trialStartedAt: startedAt }, NOW);
  assert.equal(r.status, 'trial');
  assert.equal(r.daysRemaining, TRIAL_DAYS);
});

test('trial 1ms before its 30-day boundary is still allowed with 1 day remaining', () => {
  const startedAt = NOW - (TRIAL_DAYS * DAY - 1);
  const r = computeEntitlement({ subscriptionStatus: 'trial', trialStartedAt: startedAt }, NOW);
  assert.equal(r.status, 'trial');
  assert.equal(r.allowed, true);
  assert.equal(r.daysRemaining, 1);
});

test('trial exactly at its 30-day boundary is expired (>=, not >)', () => {
  const startedAt = NOW - TRIAL_DAYS * DAY;
  const r = computeEntitlement({ subscriptionStatus: 'trial', trialStartedAt: startedAt }, NOW);
  assert.equal(r.status, 'expired');
  assert.equal(r.allowed, false);
  assert.equal(r.daysRemaining, 0);
});

test('trial well past its 30-day boundary is expired', () => {
  const startedAt = NOW - 90 * DAY;
  const r = computeEntitlement({ subscriptionStatus: 'trial', trialStartedAt: startedAt }, NOW);
  assert.equal(r.status, 'expired');
  assert.equal(r.allowed, false);
  assert.equal(r.daysRemaining, 0);
});

test('malformed trialStartedAt (unparseable string) is treated as expired, not a thrown error', () => {
  const r = computeEntitlement({ subscriptionStatus: 'trial', trialStartedAt: 'not-a-date' }, NOW);
  assert.equal(r.status, 'expired');
  assert.equal(r.allowed, false);
});

test('trialStartedAt accepts an ISO string (the shape a real Supabase row returns), not just epoch ms', () => {
  const iso = new Date(NOW - 5 * DAY).toISOString();
  const r = computeEntitlement({ subscriptionStatus: 'trial', trialStartedAt: iso }, NOW);
  assert.equal(r.status, 'trial');
  assert.equal(r.daysRemaining, TRIAL_DAYS - 5);
});

test('a future trialStartedAt (clock skew) yields the full trial length, never negative days or a crash', () => {
  const startedAt = NOW + DAY; // starts "tomorrow" from now's perspective
  const r = computeEntitlement({ subscriptionStatus: 'trial', trialStartedAt: startedAt }, NOW);
  assert.equal(r.status, 'trial');
  assert.ok(r.daysRemaining >= TRIAL_DAYS);
});

test('isAllowed folds a null/undefined entitlement (signed-out) to false without throwing', () => {
  assert.equal(isAllowed(null), false);
  assert.equal(isAllowed(undefined), false);
  assert.equal(isAllowed({ allowed: true }), true);
  assert.equal(isAllowed({ allowed: false }), false);
});
