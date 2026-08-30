import { useState } from 'react';
import { BrandMark } from './BrandMark';

interface Props {
  onBack: () => void;
  onStart: () => void;
}

type Severity = 'critical' | 'high' | 'medium' | 'good';

interface Finding {
  id: string;
  severity: Severity;
  title: string;
  detail: string;
  fix: string;
}

interface Report {
  domain: string;
  findings: Finding[];
  worst: Severity;
  headline: string;
}

const SEV_LABEL: Record<Severity, string> = {
  critical: 'Exposed',
  high: 'Weak',
  medium: 'Partial',
  good: 'Good',
};

/**
 * The exposure check: a visitor types a domain and sees what a stranger can
 * already learn about it from public DNS. Nothing here touches the target's
 * own servers; the API reads public records only. It is the product's
 * promise ("we see what's exposed") proven on the visitor's own domain.
 */
export function Exposure({ onBack, onStart }: Props) {
  const [domain, setDomain] = useState('');
  const [report, setReport] = useState<Report | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const run = async () => {
    const d = domain.trim();
    if (!d) return;
    setBusy(true);
    setError('');
    setReport(null);
    try {
      const res = await fetch(`/api/scan?domain=${encodeURIComponent(d)}`, {
        headers: { accept: 'application/json' },
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || 'That check did not work.');
      setReport(data as Report);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'That check did not work.');
    } finally {
      setBusy(false);
    }
  };

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
        <h1>See what the internet can see about you.</h1>
        <p className="content-lede">
          Type your company domain. In a few seconds you get the same read an attacker gets in
          the first minute of looking at you, built only from records you have already published
          to the public internet. We never touch your servers.
        </p>
      </header>

      <section className="content-section">
        <div className="exposure-form">
          <input
            type="text"
            inputMode="url"
            placeholder="yourcompany.com"
            value={domain}
            onChange={(e) => setDomain(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && run()}
            aria-label="Your company domain"
          />
          <button className="btn btn-primary" onClick={run} disabled={busy || !domain.trim()}>
            {busy ? 'Checking…' : 'Check my domain'}
          </button>
        </div>
        {error && <p className="exposure-error">{error}</p>}
        <p className="exposure-note">
          This reads public DNS only. It does not scan or connect to your servers, and nothing
          you check is stored.
        </p>
      </section>

      {report && (
        <>
          <section className={`content-section exposure-verdict verdict-${report.worst}`}>
            <span className="exposure-domain">{report.domain}</span>
            <h2>{report.headline}</h2>
          </section>

          <section className="content-section exposure-findings">
            {report.findings.map((f) => (
              <div className={`exposure-finding sev-${f.severity}`} key={f.id}>
                <div className="exposure-finding-head">
                  <span className={`exposure-badge sev-${f.severity}`}>{SEV_LABEL[f.severity]}</span>
                  <strong>{f.title}</strong>
                </div>
                <p>{f.detail}</p>
                {f.fix && (
                  <p className="exposure-fix">
                    <span>Fix</span> {f.fix}
                  </p>
                )}
              </div>
            ))}
          </section>

          <section className="content-section exposure-cta">
            <h2>Everything above is fixable, usually in an afternoon.</h2>
            <p>
              A Groundwork plan turns this into an ordered checklist for your whole company, not
              just email, and tracks it as you go.
            </p>
            <button className="btn btn-primary" onClick={onStart}>
              Build my security plan
            </button>
          </section>
        </>
      )}
    </div>
  );
}
