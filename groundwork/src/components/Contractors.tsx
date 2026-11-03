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

interface Report {
  domain: string;
  findings: Finding[];
  subdomains: { total: number } | null;
  repositories: { total: number; sensitive: string[] } | null;
  worst: Severity;
  headline: string;
}

interface Row {
  domain: string;
  ok: boolean;
  error?: string;
  score: number;
  grade: string;
  counts: Record<'critical' | 'high' | 'medium' | 'low', number>;
  sections: Record<Section, Severity | null>;
  subdomains: number;
  sensitiveRepos: number;
}

const SECTIONS: Section[] = ['email', 'dns', 'certificates', 'code', 'live'];
const SECTION_LABEL: Record<Section, string> = {
  email: 'Email',
  dns: 'DNS',
  certificates: 'Certs',
  code: 'Code',
  live: 'Live',
};

// Higher rank = worse. Used to pick the worst finding in a section.
const SEV_RANK: Record<Severity, number> = {
  critical: 5,
  high: 4,
  medium: 3,
  low: 2,
  good: 1,
  unknown: 0,
};

// Points off a perfect 100 per finding. Tuned so the ranking separates
// companies cleanly without everyone bottoming out at zero.
const PENALTY: Record<Severity, number> = {
  critical: 25,
  high: 14,
  medium: 6,
  low: 2,
  good: 0,
  unknown: 0,
};

const MAX_DOMAINS = 8;
const CONCURRENCY = 3;

function cleanDomain(raw: string): string {
  return raw
    .trim()
    .replace(/^https?:\/\//i, '')
    .replace(/\/.*$/, '')
    .replace(/^www\./i, '')
    .toLowerCase();
}

function gradeFor(score: number): string {
  if (score >= 90) return 'A';
  if (score >= 80) return 'B';
  if (score >= 70) return 'C';
  if (score >= 60) return 'D';
  return 'F';
}

function gradeClass(grade: string): string {
  if (grade === 'A') return 'good';
  if (grade === 'B') return 'low';
  if (grade === 'C') return 'medium';
  if (grade === 'D') return 'high';
  return 'critical';
}

function scoreReport(report: Report): Omit<Row, 'domain' | 'ok' | 'error'> {
  const counts = { critical: 0, high: 0, medium: 0, low: 0 };
  const sections: Record<Section, Severity | null> = {
    email: null,
    dns: null,
    certificates: null,
    code: null,
    live: null,
  };
  let score = 100;

  for (const f of report.findings) {
    score -= PENALTY[f.severity] ?? 0;
    if (f.severity in counts) counts[f.severity as keyof typeof counts] += 1;
    const cur = sections[f.section];
    if (cur === null || SEV_RANK[f.severity] > SEV_RANK[cur]) sections[f.section] = f.severity;
  }

  score = Math.max(0, Math.round(score));
  return {
    score,
    grade: gradeFor(score),
    counts,
    sections,
    subdomains: report.subdomains?.total ?? 0,
    sensitiveRepos: report.repositories?.sensitive.length ?? 0,
  };
}

async function runPool<T, R>(items: T[], size: number, worker: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;
  async function lane() {
    while (next < items.length) {
      const i = next++;
      results[i] = await worker(items[i]);
    }
  }
  await Promise.all(Array.from({ length: Math.min(size, items.length) }, lane));
  return results;
}

/**
 * An unlisted benchmarking page (reachable only at #/contractors): score a
 * set of defense contractors against each other on externally observable
 * security posture. It runs the same passive exposure check as the public
 * tool for each domain — public DNS, certificate transparency, the GitHub
 * public index, and one ordinary visit to the site — then turns each read
 * into a 0-100 score and ranks them. Public data only; the same footing as
 * commercial security-rating services. No logins, no scanning, no break-ins.
 */
export function Contractors({ onBack, onStart }: Props) {
  const [input, setInput] = useState('');
  const [rows, setRows] = useState<Row[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const [error, setError] = useState('');

  const domains = Array.from(
    new Set(
      input
        .split(/[\n,]+/)
        .map(cleanDomain)
        .filter(Boolean),
    ),
  ).slice(0, MAX_DOMAINS);

  const run = async () => {
    if (domains.length < 2) {
      setError('Enter at least two contractor domains, one per line.');
      return;
    }
    setError('');
    setBusy(true);
    setRows(null);
    setProgress({ done: 0, total: domains.length });

    let done = 0;
    const results = await runPool<string, Row>(domains, CONCURRENCY, async (domain) => {
      try {
        const res = await fetch(`/api/scan?domain=${encodeURIComponent(domain)}`, {
          headers: { accept: 'application/json' },
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data?.error || 'Could not read this domain.');
        const report = data as Report;
        return { domain: report.domain || domain, ok: true, ...scoreReport(report) };
      } catch (e) {
        return {
          domain,
          ok: false,
          error: e instanceof Error ? e.message : 'Could not read this domain.',
          score: 0,
          grade: 'F',
          counts: { critical: 0, high: 0, medium: 0, low: 0 },
          sections: { email: null, dns: null, certificates: null, code: null, live: null },
          subdomains: 0,
          sensitiveRepos: 0,
        };
      } finally {
        done += 1;
        setProgress({ done, total: domains.length });
      }
    });

    // Best score first; unreadable domains sink to the bottom.
    results.sort((a, b) => Number(b.ok) - Number(a.ok) || b.score - a.score);
    setRows(results);
    setBusy(false);
  };

  const scored = rows?.filter((r) => r.ok) ?? [];
  const failed = rows?.filter((r) => !r.ok) ?? [];
  const best = scored[0];
  const worst = scored[scored.length - 1];

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
        <h1>Score defense contractors against each other.</h1>
        <p className="content-lede">
          Drop in a set of contractor domains and see how their externally observable security
          posture stacks up, ranked. Each one gets the same passive read our public exposure check
          uses — public DNS, certificate transparency, the public code index, and one ordinary visit
          to the site. The same footing a security-rating agency works from. No logins, no scanning,
          no break-ins.
        </p>
      </header>

      <section className="content-section">
        <div className="scorecard-form">
          <textarea
            className="scorecard-input"
            rows={5}
            placeholder={'contractor-one.com\ncontractor-two.com\ncontractor-three.com'}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            aria-label="Contractor domains, one per line"
          />
          <div className="scorecard-actions">
            <button className="btn btn-primary" onClick={run} disabled={busy || domains.length < 2}>
              {busy ? `Scoring ${progress.done} of ${progress.total}…` : 'Score contractors'}
            </button>
            <span className="scorecard-count">
              {domains.length}/{MAX_DOMAINS} domains
            </span>
          </div>
        </div>
        {error && <p className="exposure-error">{error}</p>}
        <p className="exposure-note">
          Reads only public records and one visit per site. Nothing is stored. A score reflects what
          is visible from outside, not the defences a contractor runs internally.
        </p>
      </section>

      {rows && scored.length > 0 && (
        <>
          <section className="content-section">
            <div className="scorecard-podium">
              {best && (
                <div className="scorecard-podium-card best">
                  <span className="scorecard-podium-label">Strongest</span>
                  <span className="scorecard-podium-domain">{best.domain}</span>
                  <span className={`scorecard-grade grade-${gradeClass(best.grade)}`}>
                    {best.grade}
                  </span>
                  <span className="scorecard-podium-score">{best.score}</span>
                </div>
              )}
              {worst && worst !== best && (
                <div className="scorecard-podium-card worst">
                  <span className="scorecard-podium-label">Weakest</span>
                  <span className="scorecard-podium-domain">{worst.domain}</span>
                  <span className={`scorecard-grade grade-${gradeClass(worst.grade)}`}>
                    {worst.grade}
                  </span>
                  <span className="scorecard-podium-score">{worst.score}</span>
                </div>
              )}
            </div>
          </section>

          <section className="content-section">
            <div className="scorecard-table-wrap">
              <table className="scorecard-table">
                <thead>
                  <tr>
                    <th className="rank-col">#</th>
                    <th>Contractor</th>
                    <th>Score</th>
                    <th>Grade</th>
                    {SECTIONS.map((s) => (
                      <th key={s} className="sec-col">
                        {SECTION_LABEL[s]}
                      </th>
                    ))}
                    <th className="num-col">Exposed</th>
                  </tr>
                </thead>
                <tbody>
                  {scored.map((r, i) => (
                    <tr key={r.domain}>
                      <td className="rank-col">{i + 1}</td>
                      <td className="domain-cell">{r.domain}</td>
                      <td className="score-cell">{r.score}</td>
                      <td>
                        <span className={`scorecard-grade grade-${gradeClass(r.grade)}`}>
                          {r.grade}
                        </span>
                      </td>
                      {SECTIONS.map((s) => {
                        const sev = r.sections[s];
                        return (
                          <td key={s} className="sec-col">
                            <span
                              className={`scorecard-cell sev-${sev ?? 'none'}`}
                              title={sev ?? 'no finding'}
                            />
                          </td>
                        );
                      })}
                      <td className="num-col">
                        {r.sensitiveRepos > 0 ? (
                          <span className="scorecard-flag" title="Sensitive public repositories">
                            {r.sensitiveRepos} repo{r.sensitiveRepos === 1 ? '' : 's'}
                          </span>
                        ) : (
                          <span className="scorecard-muted">—</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="scorecard-legend">
              <span>
                <i className="scorecard-cell sev-critical" /> Exposed
              </span>
              <span>
                <i className="scorecard-cell sev-high" /> Weak
              </span>
              <span>
                <i className="scorecard-cell sev-medium" /> Partial
              </span>
              <span>
                <i className="scorecard-cell sev-low" /> Minor
              </span>
              <span>
                <i className="scorecard-cell sev-good" /> Good
              </span>
              <span>
                <i className="scorecard-cell sev-none" /> Not seen
              </span>
            </div>
          </section>
        </>
      )}

      {failed.length > 0 && (
        <section className="content-section">
          <p className="exposure-note">
            Could not read: {failed.map((f) => f.domain).join(', ')}. These were skipped — a domain
            that does not resolve, or a lookup that timed out, cannot be scored fairly.
          </p>
        </section>
      )}

      {rows && (
        <section className="content-section exposure-cta">
          <h2>This is the outside view. The inside is where the work is.</h2>
          <p>
            An external score tells you who looks exposed. A Groundwork plan turns a contractor&apos;s
            whole posture into an ordered checklist and tracks it as it gets fixed.
          </p>
          <button className="btn btn-primary" onClick={onStart}>
            Build a security plan
          </button>
        </section>
      )}
    </div>
  );
}
