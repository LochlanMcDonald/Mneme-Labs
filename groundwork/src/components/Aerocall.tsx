interface Props {
  onBack: () => void;
}

/**
 * Unlisted preview of the AeroCall tool UI, reachable only at #/aerocall.
 * AeroCall is a self-contained static page (its own vanilla JS and styles),
 * so it is embedded as a same-origin iframe rather than rebuilt in React.
 * With no AeroCall backend behind it, the page runs in its standalone mode:
 * the builder and code export work; the proxy/intercept features are inert.
 * The site's global CSP and X-Frame-Options block same-origin framing, so a
 * scoped header exception for /aerocall.html is set in staticwebapp.config.json.
 */
export function Aerocall({ onBack }: Props) {
  return (
    <div className="aerocall-frame">
      <div className="aerocall-bar">
        <button className="btn small" onClick={onBack}>
          ← Groundwork
        </button>
        <span className="aerocall-tag">AeroCall preview</span>
        <div className="aerocall-bar-right">
          <a className="btn small" href="/aerocall.py" target="_blank" rel="noreferrer">
            View source
          </a>
          <a className="btn small" href="/aerocall.py" download="aerocall.py">
            Download .py
          </a>
        </div>
      </div>
      <iframe title="AeroCall" src="/aerocall.html" />
    </div>
  );
}
