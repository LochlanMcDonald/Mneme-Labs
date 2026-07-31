import type { PollResult } from './types';

/**
 * Demo mode: the board filled with plausible data so the panel can be
 * evaluated (and screenshotted) before any keys are entered. Totals are
 * fixed, not random, so the demo tells the same story every time.
 */
export const DEMO_RESULTS: PollResult[] = [
  {
    id: 'defender',
    ok: true,
    total: 7,
    severities: { critical: 0, high: 1, medium: 4, low: 2 },
    checkedAt: new Date().toISOString(),
  },
  {
    id: 'crowdstrike',
    ok: true,
    total: 0,
    severities: { critical: 0, high: 0, medium: 0, low: 0 },
    checkedAt: new Date().toISOString(),
  },
  {
    id: 'sentinelone',
    ok: true,
    total: 1,
    severities: { critical: 1, high: 0, medium: 0, low: 0 },
    checkedAt: new Date().toISOString(),
  },
  {
    id: 'proofpoint',
    ok: true,
    total: 5,
    severities: { critical: 0, high: 2, medium: 0, low: 3 },
    checkedAt: new Date().toISOString(),
  },
  {
    id: 'gworkspace',
    ok: true,
    total: 2,
    severities: { critical: 0, high: 0, medium: 2, low: 0 },
    checkedAt: new Date().toISOString(),
  },
  {
    id: 'github',
    ok: true,
    total: 4,
    severities: { critical: 1, high: 0, medium: 0, low: 3 },
    checkedAt: new Date().toISOString(),
  },
];

/** Alerts already reviewed in the demo story, per vendor. */
export const DEMO_SEEN: Record<string, number> = {
  defender: 4,
  crowdstrike: 0,
  sentinelone: 0,
  proofpoint: 3,
  gworkspace: 2,
  github: 1,
};
