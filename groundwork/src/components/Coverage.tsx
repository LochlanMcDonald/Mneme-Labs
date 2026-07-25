import { useMemo } from 'react';
import { BrandMark } from './BrandMark';
import { CONTROLS } from '../data/controls';
import { CATEGORY_LABELS } from '../types';
import type { Category } from '../types';

interface Props {
  onBack: () => void;
  onStart: () => void;
}

/** Plain-language framing for each area, shown above the control titles. */
const AREA_BLURB: Record<Category, string> = {
  identity: 'Who can get into your accounts, and what stops someone else.',
  devices: 'The laptops and phones your work actually happens on.',
  data: 'What you hold on customers, where it lives, and how it survives a bad day.',
  cloud: 'The accounts and infrastructure your product runs on.',
  appsec: 'Keeping the code you ship from becoming the way in.',
  vendors: 'The other companies holding your data on your behalf.',
  people: 'The team, and the mistakes that are easy to make under pressure.',
  incident: 'What you do in the hour after something goes wrong.',
  compliance: 'Proving all of it to a customer, an auditor, or an insurer.',
};

const ORDER: Category[] = [
  'identity',
  'devices',
  'data',
  'cloud',
  'appsec',
  'vendors',
  'people',
  'incident',
  'compliance',
];

export function Coverage({ onBack, onStart }: Props) {
  const groups = useMemo(
    () =>
      ORDER.map((cat) => ({
        cat,
        controls: CONTROLS.filter((c) => c.category === cat),
      })).filter((g) => g.controls.length > 0),
    [],
  );

  const frameworks = useMemo(() => {
    const seen = new Set<string>();
    for (const c of CONTROLS) {
      for (const f of c.frameworks ?? []) {
        // Group by family (SOC 2 CC6.1 and SOC 2 CC6.7 are both SOC 2).
        seen.add(f.split(/\s|§/)[0].replace(/[0-9.]+$/, '').trim() || f);
      }
    }
    return [...seen].filter(Boolean).sort();
  }, []);

  return (
    <div className="content-page">
      <button className="btn" onClick={onBack}>
        ← Back
      </button>

      <header className="content-hero">
        <div className="brand small">
          <BrandMark className="brand-mark" />
          Groundwork
        </div>
        <h1>What a Groundwork plan covers.</h1>
        <p className="content-lede">
          {CONTROLS.length} controls across {groups.length} areas of a startup.
          Nobody gets all of them. Your answers decide which ones apply and what
          order they come in.
        </p>
      </header>

      <section className="content-section">
        <div className="coverage-stats">
          <div className="coverage-stat">
            <strong>{CONTROLS.length}</strong>
            <span>controls in the knowledge base</span>
          </div>
          <div className="coverage-stat">
            <strong>{groups.length}</strong>
            <span>areas, from identity to compliance</span>
          </div>
          <div className="coverage-stat">
            <strong>{frameworks.length}</strong>
            <span>framework families referenced</span>
          </div>
        </div>
        <p className="coverage-frameworks">
          Items are cross-referenced to {frameworks.join(', ')} where a mapping
          exists, so the work counts twice when an audit comes around.
        </p>
      </section>

      {groups.map(({ cat, controls }) => (
        <section className="content-section coverage-area" key={cat}>
          <h2>
            {CATEGORY_LABELS[cat]}
            <span className="coverage-count">{controls.length}</span>
          </h2>
          <p className="coverage-blurb">{AREA_BLURB[cat]}</p>
          <ul className="coverage-list">
            {controls.map((c) => (
              <li key={c.id}>{c.title}</li>
            ))}
          </ul>
        </section>
      ))}

      <section className="content-cta">
        <h2>See which of these are yours</h2>
        <p>
          The questionnaire takes about five minutes and rules out everything
          that does not apply to you.
        </p>
        <button className="btn btn-primary btn-lg" onClick={onStart}>
          Build my security plan
        </button>
      </section>
    </div>
  );
}
