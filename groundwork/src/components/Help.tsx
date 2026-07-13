import { useState } from 'react';
import { GENERAL_FAQS, INCIDENT_PLAYBOOKS, type HelpEntry } from '../data/help';

interface Props {
  onBack: () => void;
  backLabel: string;
}

function HelpAccordion({ entry }: { entry: HelpEntry }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="item-card">
      <div className="item-head">
        <button className="item-title" onClick={() => setOpen(!open)} aria-expanded={open}>
          <span>{entry.title}</span>
        </button>
        <span className={`chevron ${open ? 'open' : ''}`} aria-hidden>
          ▾
        </span>
      </div>
      {open && (
        <div className="item-detail">
          {entry.intro && <p className="item-why">{entry.intro}</p>}
          <div className="item-how">
            <ol>
              {entry.steps.map((step) => (
                <li key={step}>{step}</li>
              ))}
            </ol>
          </div>
        </div>
      )}
    </div>
  );
}

export function Help({ onBack, backLabel }: Props) {
  return (
    <div className="help">
      <div className="brand small">
        <span className="brand-mark" aria-hidden>
          ⬢
        </span>
        Groundwork
      </div>
      <button className="btn" onClick={onBack}>
        ← {backLabel}
      </button>

      <section className="help-section">
        <h2>Something just happened?</h2>
        <p className="help-sub">
          First-aid playbooks for the incidents startups actually hit. Work
          top to bottom; containment first, tidy explanations later.
        </p>
        {INCIDENT_PLAYBOOKS.map((entry) => (
          <HelpAccordion key={entry.id} entry={entry} />
        ))}
      </section>

      <section className="help-section">
        <h2>Questions along the way</h2>
        <p className="help-sub">
          Straight answers to the questions founders ask us most.
        </p>
        {GENERAL_FAQS.map((entry) => (
          <HelpAccordion key={entry.id} entry={entry} />
        ))}
        <p className="help-contact">
          Didn't find what you need? Email{' '}
          <a href="mailto:support@groundwork-security.com">
            support@groundwork-security.com
          </a>
          .
        </p>
      </section>
    </div>
  );
}
