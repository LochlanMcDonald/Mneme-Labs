import { useMemo, useState } from 'react';
import type { Store } from '../state/store';
import { AccountControls } from './Account';
import { planStats } from '../engine/plan';
import { planToMarkdown } from '../export/markdown';
import type { Category, ItemStatus, Phase, PlanItem } from '../types';
import {
  CATEGORY_LABELS,
  COST_LABELS,
  EFFORT_LABELS,
  PHASE_LABELS,
  PHASE_ORDER,
} from '../types';

interface Props {
  store: Store;
  onEditProfile: () => void;
  onHelp: () => void;
  onReport: () => void;
  onAdvisor: () => void;
  onAdmin: () => void;
}

const STATUS_LABELS: Record<ItemStatus, string> = {
  todo: 'To do',
  'in-progress': 'In progress',
  done: 'Done',
  na: 'N/A',
};

const STATUS_CYCLE: ItemStatus[] = ['todo', 'in-progress', 'done', 'na'];

function ProgressRing({ percent }: { percent: number }) {
  const r = 52;
  const c = 2 * Math.PI * r;
  return (
    <svg className="progress-ring" viewBox="0 0 120 120" role="img" aria-label={`${percent}% complete`}>
      <circle cx="60" cy="60" r={r} className="ring-track" />
      <circle
        cx="60"
        cy="60"
        r={r}
        className="ring-fill"
        strokeDasharray={c}
        strokeDashoffset={c * (1 - percent / 100)}
      />
      <text x="60" y="66" textAnchor="middle" className="ring-text">
        {percent}%
      </text>
    </svg>
  );
}

function ItemCard({
  item,
  status,
  note,
  expanded,
  onToggle,
  onStatus,
  onNote,
}: {
  item: PlanItem;
  status: ItemStatus;
  note: string;
  expanded: boolean;
  onToggle: () => void;
  onStatus: (s: ItemStatus) => void;
  onNote: (n: string) => void;
}) {
  const c = item.control;
  return (
    <div className={`item-card status-${status}`}>
      <div className="item-head">
        <button
          className={`status-btn status-${status}`}
          title={`Status: ${STATUS_LABELS[status]} (click to change)`}
          onClick={() =>
            onStatus(STATUS_CYCLE[(STATUS_CYCLE.indexOf(status) + 1) % STATUS_CYCLE.length])
          }
        >
          {status === 'done' ? '✓' : status === 'in-progress' ? '◐' : status === 'na' ? '–' : ''}
        </button>
        <button className="item-title" onClick={onToggle} aria-expanded={expanded}>
          <span>{c.title}</span>
          <span className="item-meta">
            <span className="tag">{CATEGORY_LABELS[c.category]}</span>
            <span className="tag">{EFFORT_LABELS[c.effort]}</span>
            <span className="tag">{COST_LABELS[c.cost]}</span>
          </span>
        </button>
        <span className={`chevron ${expanded ? 'open' : ''}`} aria-hidden>
          ▾
        </span>
      </div>
      {expanded && (
        <div className="item-detail">
          <p className="item-why">{c.why}</p>
          <p className="item-reason">
            <strong>Why it’s in your plan:</strong> {item.reasons.join(' ')}
          </p>
          <div className="item-how">
            <strong>How to do it</strong>
            <ol>
              {c.how.map((step) => (
                <li key={step}>{step}</li>
              ))}
            </ol>
          </div>
          {c.tools && (
            <p className="item-tools">
              <strong>Tools to consider:</strong> {c.tools.join(', ')}
            </p>
          )}
          {c.frameworks && (
            <p className="item-frameworks">
              <strong>Maps to:</strong> {c.frameworks.join(' · ')}
            </p>
          )}
          <div className="item-status-row">
            <span className="field-label">Status</span>
            <div className="status-pills">
              {STATUS_CYCLE.map((s) => (
                <button
                  key={s}
                  className={`pill ${status === s ? 'selected' : ''}`}
                  onClick={() => onStatus(s)}
                >
                  {STATUS_LABELS[s]}
                </button>
              ))}
            </div>
          </div>
          <label className="field">
            <span className="field-label">Notes</span>
            <textarea
              rows={2}
              value={note}
              placeholder="Who's on it, links, decisions…"
              onChange={(e) => onNote(e.target.value)}
            />
          </label>
        </div>
      )}
    </div>
  );
}

export function Dashboard({ store, onEditProfile, onHelp, onReport, onAdvisor, onAdmin }: Props) {
  const { plan, profile, items } = store;
  const [expanded, setExpanded] = useState<string | null>(null);
  const [categoryFilter, setCategoryFilter] = useState<Category | 'all'>('all');
  const [hideDone, setHideDone] = useState(false);
  const [copied, setCopied] = useState(false);

  const stats = useMemo(
    () => (plan ? planStats(plan, items) : null),
    [plan, items],
  );

  if (!plan || !profile || !stats) return null;

  const visible = plan.items.filter((item) => {
    if (categoryFilter !== 'all' && item.control.category !== categoryFilter) return false;
    const status = items[item.control.id]?.status ?? 'todo';
    if (hideDone && (status === 'done' || status === 'na')) return false;
    return true;
  });

  const categories = Array.from(new Set(plan.items.map((i) => i.control.category)));

  const exportMarkdown = () => {
    const md = planToMarkdown(profile, plan, items);
    const blob = new Blob([md], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${(profile.companyName.trim() || 'startup').toLowerCase().replace(/\s+/g, '-')}-security-plan.md`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const copyMarkdown = async () => {
    try {
      await navigator.clipboard.writeText(planToMarkdown(profile, plan, items));
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard may be blocked; the download button still works.
    }
  };

  return (
    <div className="dashboard">
      <header className="dash-header">
        <div>
          <div className="brand small">
            <span className="brand-mark" aria-hidden>
              ⬢
            </span>
            Groundwork
          </div>
          <h2>{profile.companyName.trim() || 'Your security plan'}</h2>
          <p className="dash-sub">
            {stats.done} of {stats.total} controls done
            {stats.inProgress > 0 && <> · {stats.inProgress} in progress</>}
          </p>
          <div className="dash-actions">
            <button className="btn" onClick={onEditProfile}>
              Edit answers
            </button>
            <button className="btn" onClick={exportMarkdown}>
              Download plan (.md)
            </button>
            <button className="btn" onClick={copyMarkdown}>
              {copied ? 'Copied!' : 'Copy as Markdown'}
            </button>
            <button className="btn" onClick={onHelp}>
              Incident help &amp; FAQs
            </button>
            <button className="btn" onClick={onReport}>
              Security report <span className="pro-badge">PRO</span>
            </button>
            <button className="btn" onClick={onAdvisor}>
              Ask an advisor <span className="pro-badge">PRO</span>
            </button>
            {store.me?.admin && (
              <button className="btn" onClick={onAdmin}>
                Admin
              </button>
            )}
          </div>
          <AccountControls auth={store.auth} sync={store.sync} />
        </div>
        <ProgressRing percent={stats.percent} />
      </header>

      <div className="filters">
        <div className="status-pills">
          <button
            className={`pill ${categoryFilter === 'all' ? 'selected' : ''}`}
            onClick={() => setCategoryFilter('all')}
          >
            All
          </button>
          {categories.map((cat) => (
            <button
              key={cat}
              className={`pill ${categoryFilter === cat ? 'selected' : ''}`}
              onClick={() => setCategoryFilter(cat)}
            >
              {CATEGORY_LABELS[cat]}
            </button>
          ))}
        </div>
        <label className="hide-done">
          <input type="checkbox" checked={hideDone} onChange={(e) => setHideDone(e.target.checked)} />
          Hide completed
        </label>
      </div>

      {(PHASE_ORDER as Phase[]).map((phase) => {
        const phaseItems = visible.filter((i) => i.phase === phase);
        if (phaseItems.length === 0) return null;
        const phaseDone = phaseItems.filter(
          (i) => (items[i.control.id]?.status ?? 'todo') === 'done',
        ).length;
        return (
          <section key={phase} className="phase">
            <h3 className="phase-title">
              {PHASE_LABELS[phase]}
              <span className="phase-count">
                {phaseDone}/{phaseItems.length}
              </span>
            </h3>
            {phaseItems.map((item) => {
              const st = items[item.control.id] ?? { status: 'todo' as ItemStatus, note: '' };
              return (
                <ItemCard
                  key={item.control.id}
                  item={item}
                  status={st.status}
                  note={st.note}
                  expanded={expanded === item.control.id}
                  onToggle={() =>
                    setExpanded(expanded === item.control.id ? null : item.control.id)
                  }
                  onStatus={(s) => store.setStatus(item.control.id, s)}
                  onNote={(n) => store.setNote(item.control.id, n)}
                />
              );
            })}
          </section>
        );
      })}

      <footer className="dash-footer">
        <button
          className="btn btn-danger"
          onClick={() => {
            if (window.confirm('Start over? This clears your profile and all progress.')) {
              store.reset();
            }
          }}
        >
          Start over
        </button>
      </footer>
    </div>
  );
}
