import { describe, expect, it } from 'vitest';
import { resolveInitialState } from './sync';
import type { AppState, CompanyProfile } from '../types';

const profile: CompanyProfile = {
  companyName: 'Testco',
  description: '',
  teamSize: 'small',
  stage: 'building',
  productTypes: ['saas'],
  dataTypes: ['pii'],
  infra: ['azure'],
  codeHosting: 'github',
  customers: ['b2b'],
  workModel: 'remote',
  deviceModel: 'mixed',
  complianceTargets: [],
  existing: [],
};

const USER = 'user-A';
const empty: AppState = { profile: null, items: {}, generatedAt: null, ownerId: null };
const withPlan: AppState = {
  profile,
  items: { 'mfa-everywhere': { status: 'done', note: '' } },
  generatedAt: '2026-07-13T00:00:00.000Z',
  ownerId: null,
};

describe('resolveInitialState', () => {
  it('uses the account plan when one is saved', () => {
    const res = resolveInitialState(empty, withPlan, USER);
    expect(res.action).toBe('use-server');
    if (res.action === 'use-server') {
      expect(res.state.profile?.companyName).toBe('Testco');
    }
  });

  it('prefers the account plan over a local plan', () => {
    const local: AppState = { ...withPlan, profile: { ...profile, companyName: 'LocalCo' } };
    const res = resolveInitialState(local, withPlan, USER);
    expect(res.action).toBe('use-server');
  });

  it('adopts a logged-out (unowned) local plan into an empty account', () => {
    expect(resolveInitialState(withPlan, null, USER).action).toBe('push-local');
    expect(resolveInitialState(withPlan, empty, USER).action).toBe('push-local');
  });

  it('adopts the local plan when it already belongs to this user', () => {
    const mine: AppState = { ...withPlan, ownerId: USER };
    expect(resolveInitialState(mine, null, USER).action).toBe('push-local');
  });

  it('does NOT adopt another user\'s leftover local plan; starts fresh', () => {
    const othersPlan: AppState = { ...withPlan, ownerId: 'user-B' };
    expect(resolveInitialState(othersPlan, null, USER).action).toBe('reset');
    expect(resolveInitialState(othersPlan, empty, USER).action).toBe('reset');
  });

  it('resets when neither side has a plan', () => {
    expect(resolveInitialState(empty, null, USER).action).toBe('reset');
    expect(resolveInitialState(empty, empty, USER).action).toBe('reset');
  });
});
