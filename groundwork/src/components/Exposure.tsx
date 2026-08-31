import { useState } from 'react';
import { BrandMark } from './BrandMark';

interface Props {
  onBack: () => void;
  onStart: () => void;
}

type Severity = 'critical' | 'high' | 'medium' | 'low' | 'good' | 'unknown';
type Section = 'email' | 'dns' | 'certificates' | 'code' | 'live';

interface Finding {
  id: string;
  section: Section;
  severity: Severity;
  title: string;
  detail: string;
  fix: string;
}

interface Subdomains {
  list: string[];
  total: number;
  interesting: string[];
}

interface Repo {
  name: string;
  url: string;
  description: string;
}

interface Repositories {
  list: Repo[];
  total: number;
  sensitive: string[];
}

interface Report {
  domain: string;
  findings: Finding[];
  subdomains: Subdomains | null;
  repositories: Repositories | null;
  worst: Severity;
  headline: string;
}

const SEV_LABEL: Record<Severity, string> = {
  critical: 'Exposed',
  high: 'Weak',
  medium: 'Partial',
  low: 'Minor',
  good: 'Good',
  unknown: 'Unknown',
};

const SECTION_ORDER: Section[] = ['email', 'dns', 'certificates', 'code', 'live'];

const SECTION_LABEL: Record<Section, string> = {
  email: 'Email spoofing',
  dns: 'DNS and domain',
  certificates: 'Certificates and subdomains',
  code: 'Public code',
  live: 'Live check',
};

const SECTION_NOTE: Record<Section, string> = {
  email: 'Whether a stranger can send mail that looks like it came from you.',
  dns: 'How well your domain records themselves are protected.',
  certificates: 'What your public certificate history reveals about you.',
  code: 'What public source repositories reveal about you.',
  live: 'What a single visit to your site reveals.',
};

/**
 * The exposure check: a visitor types a domain and sees what a stranger can
 * already learn about it. The API reads public records (DNS, certificate
 * logs, GitHub's public index) and looks at the site the way any visitor
 * does, one ordinary request. No logins, no port scans. It is the product's
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

  const findingCard = (f: Finding) => (
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
  );

  const acted = report && (report.worst === 'critical' || report.worst === 'high' || report.worst === 'medium');

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
          the first minute of looking at you, built from records you have already published to the
          public internet and from what any visitor to your site can already see. No logins, no
          port scans, no break-ins.
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
          This reads public records and looks at your site the way any visitor does. No logins, no
          port scans, and nothing you check is stored.
        </p>
      </section>

      {report && (
        <>
          <section className={`content-section exposure-verdict verdict-${report.worst}`}>
            <span className="exposure-domain">{report.domain}</span>
            <h2>{report.headline}</h2>
          </section>

          {SECTION_ORDER.map((section) => {
            const items = report.findings.filter((f) => f.section === section);
            if (items.length === 0) return null;
            return (
              <section className="content-section exposure-findings" key={section}>
                <div className="exposure-section-head">
                  <h3>{SECTION_LABEL[section]}</h3>
                  <p>{SECTION_NOTE[section]}</p>
                </div>
                {items.map(findingCard)}
              </section>
            );
          })}

          {report.subdomains && report.subdomains.total > 0 && (
            <section className="content-section exposure-subdomains">
              <div className="exposure-section-head">
                <h3>What is discoverable</h3>
                <p>
                  Every certificate your domain has ever requested is recorded in public logs.
                  These {report.subdomains.total} name{report.subdomains.total === 1 ? '' : 's'} are
                  visible to anyone, no scanning required.
                </p>
              </div>
              <div className="exposure-host-list">
                {report.subdomains.list.map((host) => {
                  const flagged = report.subdomains!.interesting.includes(host);
                  return (
                    <span className={`exposure-host${flagged ? ' flagged' : ''}`} key={host}>
                      {host}
                    </span>
                  );
                })}
              </div>
              {report.subdomains.total > report.subdomains.list.length && (
                <p className="exposure-note">
                  Showing {report.subdomains.list.length} of {report.subdomains.total}.
                </p>
              )}
            </section>
          )}

          {report.repositories && report.repositories.total > 0 && (
            <section className="content-section exposure-repos">
              <div className="exposure-section-head">
                <h3>Public repositories that mention you</h3>
                <p>
                  These {report.repositories.total} public repositor
                  {report.repositories.total === 1 ? 'y' : 'ies'} reference your domain and are
                  searchable by anyone on GitHub. Confirm each is meant to be public.
                </p>
              </div>
              <div className="exposure-repo-list">
                {report.repositories.list.map((r) => {
                  const flagged = report.repositories!.sensitive.includes(r.name);
                  return (
                    <a
                      className={`exposure-repo${flagged ? ' flagged' : ''}`}
                      href={r.url}
                      target="_blank"
                      rel="noreferrer noopener"
                      key={r.name}
                    >
                      <span className="exposure-repo-name">{r.name}</span>
                      {r.description && <span className="exposure-repo-desc">{r.description}</span>}
                    </a>
                  );
                })}
              </div>
              {report.repositories.total > report.repositories.list.length && (
                <p className="exposure-note">
                  Showing {report.repositories.list.length} of {report.repositories.total}.
                </p>
              )}
            </section>
          )}

          <section className="content-section exposure-cta">
            <h2>
              {acted
                ? 'Everything above is fixable, usually in an afternoon.'
                : report.worst === 'unknown'
                  ? 'Run it again in a moment for a complete read.'
                  : report.worst === 'low'
                    ? 'Well managed, with a couple of small things to tighten.'
                    : 'Your public records are in good shape. Now the rest of it.'}
            </h2>
            <p>
              A Groundwork plan turns this into an ordered checklist for your whole company, not
              just what is public, and tracks it as you go.
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
