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

const empty: AppState = { profile: null, items: {}, generatedAt: null };
const withPlan: AppState = {
  profile,
  items: { 'mfa-everywhere': { status: 'done', note: '' } },
  generatedAt: '2026-07-13T00:00:00.000Z',
};

describe('resolveInitialState', () => {
  it('uses the account plan when one is saved', () => {
    const res = resolveInitialState(empty, withPlan);
    expect(res.action).toBe('use-server');
    if (res.action === 'use-server') {
      expect(res.state.profile?.companyName).toBe('Testco');
    }
  });

  it('prefers the account plan over a local plan', () => {
    const local: AppState = { ...withPlan, profile: { ...profile, companyName: 'LocalCo' } };
    const res = resolveInitialState(local, withPlan);
    expect(res.action).toBe('use-server');
  });

  it('pushes the local plan when the account is empty', () => {
    expect(resolveInitialState(withPlan, null).action).toBe('push-local');
    expect(resolveInitialState(withPlan, empty).action).toBe('push-local');
  });

  it('does nothing when neither side has a plan', () => {
    expect(resolveInitialState(empty, null).action).toBe('none');
    expect(resolveInitialState(empty, empty).action).toBe('none');
  });
});
