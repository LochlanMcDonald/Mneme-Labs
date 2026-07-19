import { useMemo } from 'react';
import type { Store } from '../state/store';
import { planStats } from '../engine/plan';
import { BrandMark } from './BrandMark';
import { Upgrade } from './Upgrade';
import type { Category, ItemStatus } from '../types';
import {
  CATEGORY_LABELS,
  COST_LABELS,
  EFFORT_LABELS,
  PHASE_LABELS,
  PHASE_ORDER,
} from '../types';

interface Props {
  store: Store;
  onBack: () => void;
}

const STATUS_LABELS: Record<ItemStatus, string> = {
  todo: 'To do',
  'in-progress': 'In progress',
  done: 'Done',
  na: 'N/A',
};

export function Report({ store, onBack }: Props) {
  const { plan, profile, items, me } = store;

  const stats = useMemo(() => (plan ? planStats(plan, items) : null), [plan, items]);

  const categories = useMemo(() => {
    if (!plan) return [];
    const byCat = new Map<Category, { total: number; done: number }>();
    for (const item of plan.items) {
      const status = items[item.control.id]?.status ?? 'todo';
      if (status === 'na') continue;
      const entry = byCat.get(item.control.category) ?? { total: 0, done: 0 };
      entry.total += 1;
      if (status === 'done') entry.done += 1;
      byCat.set(item.control.category, entry);
    }
    return Array.from(byCat.entries());
  }, [plan, items]);

  if (!plan || !profile || !stats) {
    return (
      <div className="pro-view">
        <button className="btn" onClick={onBack}>
          ← Back
        </button>
        <p className="help-sub">Build your plan first; the report is generated from it.</p>
      </div>
    );
  }

  if (!me?.pro) {
    return (
      <div className="pro-view">
        <button className="btn" onClick={onBack}>
          ← Back
        </button>
        <Upgrade auth={store.auth} />
      </div>
    );
  }

  const name = profile.companyName.trim() || 'Your startup';
  const today = new Date().toISOString().slice(0, 10);

  return (
    <div className="pro-view">
      <div className="report-toolbar">
        <button className="btn" onClick={onBack}>
          ← Back
        </button>
        <button className="btn btn-primary" onClick={() => window.print()}>
          Print / Save as PDF
        </button>
      </div>

      <div className="report">
        <header className="report-header">
          <div className="report-brand"><BrandMark className="report-brand-mark" /> Groundwork</div>
          <h1>Security Readiness Report</h1>
          <div className="report-company">{name}</div>
          {profile.description.trim() && (
            <p className="report-desc">{profile.description.trim()}</p>
          )}
          <div className="report-date">Generated {today}</div>
        </header>

        <section className="report-summary">
          <div className="report-score">
            <div className="report-score-num">{stats.percent}%</div>
            <div className="report-score-label">of applicable controls complete</div>
          </div>
          <div className="report-stats">
            <div>
              <strong>{stats.done}</strong> done
            </div>
            <div>
              <strong>{stats.inProgress}</strong> in progress
            </div>
            <div>
              <strong>{stats.total - stats.done - stats.inProgress}</strong> to do
            </div>
            <div>
              <strong>{stats.total}</strong> applicable controls
            </div>
          </div>
        </section>

        <section>
          <h2>Coverage by area</h2>
          <table className="report-table">
            <thead>
              <tr>
                <th>Area</th>
                <th>Complete</th>
                <th>Progress</th>
              </tr>
            </thead>
            <tbody>
              {categories.map(([cat, entry]) => (
                <tr key={cat}>
                  <td>{CATEGORY_LABELS[cat]}</td>
                  <td>
                    {entry.done}/{entry.total}
                  </td>
                  <td>
                    <div className="report-bar">
                      <div
                        className="report-bar-fill"
                        style={{ width: `${entry.total ? Math.round((entry.done / entry.total) * 100) : 0}%` }}
                      />
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        {PHASE_ORDER.map((phase) => {
          const phaseItems = plan.items.filter((i) => i.phase === phase);
          if (phaseItems.length === 0) return null;
          return (
            <section key={phase} className="report-phase">
              <h2>{PHASE_LABELS[phase]}</h2>
              {phaseItems.map((item) => {
                const state = items[item.control.id];
                const status = state?.status ?? 'todo';
                return (
                  <div key={item.control.id} className="report-item">
                    <div className="report-item-head">
                      <span className={`report-status report-status-${status}`}>
                        {STATUS_LABELS[status]}
                      </span>
                      <span className="report-item-title">{item.control.title}</span>
                    </div>
                    <div className="report-item-meta">
                      {CATEGORY_LABELS[item.control.category]} · Effort:{' '}
                      {EFFORT_LABELS[item.control.effort]} · Cost: {COST_LABELS[item.control.cost]}
                    </div>
                    <p className="report-item-why">{item.control.why}</p>
                    {state?.note.trim() && (
                      <p className="report-item-note">Note: {state.note.trim()}</p>
                    )}
                  </div>
                );
              })}
            </section>
          );
        })}

        <footer className="report-footer">
          Prepared with Groundwork · groundwork-security.com · {today}
        </footer>
      </div>
    </div>
  );
}
