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
        <div className="help-callout">
          If money, health data, or a live intrusion is involved, get
          professionals on the line early: your cyber insurer's hotline if
          you have one, an incident response firm if you do not. These steps
          buy you time; they are not a substitute for expert help.
        </div>
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
      </section>
    </div>
  );
}
