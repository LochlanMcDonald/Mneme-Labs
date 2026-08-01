import type { PollResult, Severity, VendorDef } from '../types';

const SEVERITIES: Severity[] = ['critical', 'high', 'medium', 'low'];

interface Props {
  def: VendorDef;
  result: PollResult | null;
  consoleUrl: string;
  /** Alerts already reviewed; the headline number is what's new beyond it. */
  seenTotal: number;
  onReviewed: () => void;
}

export function VendorTile({ def, result, consoleUrl, seenTotal, onReviewed }: Props) {
  const fresh = result && result.ok ? Math.max(0, result.total - seenTotal) : 0;
  const calm = result?.ok && fresh === 0;

  return (
    <article className={`tile tile-${def.accent} ${calm ? 'tile-calm' : ''}`}>
      <header className="tile-head">
        <h3>{def.name}</h3>
        <span
          className={`tile-health ${result ? (result.ok ? 'ok' : 'down') : 'wait'}`}
          title={result ? (result.ok ? 'API reachable' : result.error || 'API error') : 'Waiting for first check'}
        />
      </header>

      {result && result.ok ? (
        <>
          <div className="tile-count">
            <strong>{fresh}</strong>
            <span>{fresh === 1 ? 'new alert' : 'new alerts'}</span>
          </div>
          <div className="tile-sev">
            {SEVERITIES.map((s) =>
              result.severities[s] > 0 ? (
                <span key={s} className={`sev sev-${s}`}>
                  {result.severities[s]} {s}
                </span>
              ) : null,
            )}
            {result.total === 0 && <span className="sev sev-clear">All clear</span>}
          </div>
        </>
      ) : (
        <div className="tile-count tile-empty">
          <span>{result ? result.error || 'Could not reach the API' : 'Checking…'}</span>
        </div>
      )}

      <footer className="tile-foot">
        <a className="tile-link" href={consoleUrl} target="_blank" rel="noreferrer">
          Open console ↗
        </a>
        {result && result.ok && fresh > 0 && (
          <button className="tile-reviewed" onClick={onReviewed}>
            Mark reviewed
          </button>
        )}
      </footer>
    </article>
  );
}
