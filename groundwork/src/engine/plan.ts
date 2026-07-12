import { CONTROLS } from '../data/controls';
import type {
  CompanyProfile,
  Control,
  ItemState,
  Plan,
  PlanItem,
  Phase,
} from '../types';
import { PHASE_ORDER } from '../types';

const phaseRank = (phase: Phase) => PHASE_ORDER.indexOf(phase);

/** Pick the earlier of two phases. */
const earlier = (a: Phase, b: Phase): Phase => (phaseRank(a) <= phaseRank(b) ? a : b);

/**
 * Build a tailored security plan from a company profile.
 *
 * - Baseline controls are always included.
 * - Conditional controls are included when their `when` rule matches, with the
 *   returned string recorded as the profile-specific reason.
 * - `promote` rules can pull a control into an earlier phase (never later).
 */
export function buildPlan(profile: CompanyProfile, controls: Control[] = CONTROLS): Plan {
  const items: PlanItem[] = [];

  for (const control of controls) {
    const reasons: string[] = [];

    if (control.baseline) {
      reasons.push('Baseline: every company needs this.');
    }
    const reason = control.when?.(profile) ?? null;
    if (reason) {
      reasons.push(reason);
    }
    if (reasons.length === 0) continue;

    let phase = control.phase;
    const promoted = control.promote?.(profile) ?? null;
    if (promoted) {
      phase = earlier(phase, promoted);
    }

    items.push({ control, phase, reasons });
  }

  items.sort((a, b) => phaseRank(a.phase) - phaseRank(b.phase));

  return { items, generatedAt: new Date().toISOString() };
}

/**
 * Initial per-item state for a fresh plan: controls covered by a reported
 * existing measure start as done, everything else as todo.
 */
export function initialItemStates(profile: CompanyProfile, plan: Plan): Record<string, ItemState> {
  const states: Record<string, ItemState> = {};
  for (const item of plan.items) {
    const covered =
      item.control.satisfiedBy !== undefined &&
      profile.existing.includes(item.control.satisfiedBy);
    states[item.control.id] = {
      status: covered ? 'done' : 'todo',
      note: covered ? 'Marked done from your onboarding answers. Worth double-checking coverage.' : '',
    };
  }
  return states;
}

export interface PlanStats {
  total: number;
  done: number;
  inProgress: number;
  /** 0–100, ignoring items marked not-applicable. */
  percent: number;
}

export function planStats(plan: Plan, states: Record<string, ItemState>): PlanStats {
  let done = 0;
  let inProgress = 0;
  let applicable = 0;
  for (const item of plan.items) {
    const s = states[item.control.id];
    if (s?.status === 'na') continue;
    applicable += 1;
    if (s?.status === 'done') done += 1;
    else if (s?.status === 'in-progress') inProgress += 1;
  }
  return {
    total: applicable,
    done,
    inProgress,
    percent: applicable === 0 ? 0 : Math.round((done / applicable) * 100),
  };
}
