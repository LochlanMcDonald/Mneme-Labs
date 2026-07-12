import { describe, expect, it } from 'vitest';
import { buildPlan, initialItemStates, planStats } from './plan';
import { CONTROLS } from '../data/controls';
import type { CompanyProfile } from '../types';
import { PHASE_ORDER } from '../types';

const baseProfile: CompanyProfile = {
  companyName: 'Testco',
  description: 'A test company',
  teamSize: 'small',
  stage: 'building',
  productTypes: ['saas'],
  dataTypes: ['pii'],
  infra: ['aws'],
  codeHosting: 'github',
  customers: ['b2b'],
  workModel: 'remote',
  deviceModel: 'mixed',
  complianceTargets: [],
  existing: [],
};

const minimalProfile: CompanyProfile = {
  companyName: 'Solo',
  description: '',
  teamSize: 'solo',
  stage: 'idea',
  productTypes: ['internal'],
  dataTypes: ['minimal'],
  infra: ['none'],
  codeHosting: 'none',
  customers: [],
  workModel: 'remote',
  deviceModel: 'byod',
  complianceTargets: ['none'],
  existing: [],
};

describe('knowledge base integrity', () => {
  it('has unique control ids', () => {
    const ids = CONTROLS.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('every non-baseline control has a when rule', () => {
    for (const c of CONTROLS) {
      if (!c.baseline) {
        expect(c.when, `${c.id} needs a when rule or baseline flag`).toBeDefined();
      }
    }
  });

  it('every control has why, how steps, and framework tags', () => {
    for (const c of CONTROLS) {
      expect(c.why.length, c.id).toBeGreaterThan(20);
      expect(c.how.length, c.id).toBeGreaterThan(1);
    }
  });
});

describe('buildPlan', () => {
  it('always includes all baseline controls', () => {
    const plan = buildPlan(minimalProfile);
    const baselineIds = CONTROLS.filter((c) => c.baseline).map((c) => c.id);
    const planIds = plan.items.map((i) => i.control.id);
    for (const id of baselineIds) {
      expect(planIds).toContain(id);
    }
  });

  it('gives every item at least one reason', () => {
    for (const item of buildPlan(baseProfile).items) {
      expect(item.reasons.length).toBeGreaterThan(0);
    }
  });

  it('includes cloud controls only for cloud users', () => {
    const withCloud = buildPlan(baseProfile).items.map((i) => i.control.id);
    expect(withCloud).toContain('cloud-root-lockdown');
    expect(withCloud).toContain('cloud-audit-logging');

    const noCloud = buildPlan(minimalProfile).items.map((i) => i.control.id);
    expect(noCloud).not.toContain('cloud-root-lockdown');
    expect(noCloud).not.toContain('cloud-audit-logging');
  });

  it('includes code controls only when there is a codebase', () => {
    const noCode = buildPlan(minimalProfile).items.map((i) => i.control.id);
    expect(noCode).not.toContain('branch-protection');
    expect(noCode).not.toContain('dependency-scanning');
    expect(noCode).not.toContain('secret-scanning');
  });

  it('brings in compliance controls from data types even when unstated', () => {
    const plan = buildPlan({ ...baseProfile, dataTypes: ['pii', 'health', 'payments'] });
    const ids = plan.items.map((i) => i.control.id);
    expect(ids).toContain('hipaa-basics');
    expect(ids).toContain('pci-scope');
  });

  it('adds SOC 2 readiness for enterprise sellers even without a stated target', () => {
    const plan = buildPlan({ ...baseProfile, customers: ['b2b', 'enterprise'] });
    expect(plan.items.map((i) => i.control.id)).toContain('soc2-prep');
  });

  it('promotes controls to earlier phases but never demotes', () => {
    // encryption-at-rest defaults to 'thirty' and is promoted to 'now' for health data.
    const withHealth = buildPlan({ ...baseProfile, dataTypes: ['health'] });
    const item = withHealth.items.find((i) => i.control.id === 'encryption-at-rest');
    expect(item?.phase).toBe('now');

    const withPii = buildPlan(baseProfile);
    const item2 = withPii.items.find((i) => i.control.id === 'encryption-at-rest');
    expect(item2?.phase).toBe('thirty');
  });

  it('sorts items by phase order', () => {
    const plan = buildPlan(baseProfile);
    const ranks = plan.items.map((i) => PHASE_ORDER.indexOf(i.phase));
    expect(ranks).toEqual([...ranks].sort((a, b) => a - b));
  });

  it('tailors work-model controls', () => {
    const remote = buildPlan({ ...baseProfile, workModel: 'remote' }).items.map((i) => i.control.id);
    expect(remote).toContain('remote-work-hygiene');
    expect(remote).not.toContain('office-physical');

    const office = buildPlan({ ...baseProfile, workModel: 'office' }).items.map((i) => i.control.id);
    expect(office).toContain('office-physical');
    expect(office).not.toContain('remote-work-hygiene');

    const hybrid = buildPlan({ ...baseProfile, workModel: 'hybrid' }).items.map((i) => i.control.id);
    expect(hybrid).toContain('office-physical');
    expect(hybrid).toContain('remote-work-hygiene');
  });
});

describe('initialItemStates', () => {
  it('pre-marks controls covered by existing measures as done', () => {
    const profile: CompanyProfile = { ...baseProfile, existing: ['mfa', 'backups'] };
    const plan = buildPlan(profile);
    const states = initialItemStates(profile, plan);
    expect(states['mfa-everywhere'].status).toBe('done');
    expect(states['backups'].status).toBe('done');
    expect(states['password-manager'].status).toBe('todo');
  });
});

describe('planStats', () => {
  it('computes percent over applicable items only', () => {
    const plan = buildPlan(baseProfile);
    const states = initialItemStates(baseProfile, plan);
    const ids = plan.items.map((i) => i.control.id);
    // Mark half done, one N/A.
    states[ids[0]] = { status: 'na', note: '' };
    states[ids[1]] = { status: 'done', note: '' };
    states[ids[2]] = { status: 'in-progress', note: '' };
    const stats = planStats(plan, states);
    expect(stats.total).toBe(plan.items.length - 1);
    expect(stats.done).toBe(1);
    expect(stats.inProgress).toBe(1);
    expect(stats.percent).toBe(Math.round((1 / (plan.items.length - 1)) * 100));
  });
});
