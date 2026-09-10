import { useState } from 'react';

interface Props {
  onBack: () => void;
}

/**
 * The #/aerocall preview. Two tabs: a Quick start guide (a feature video plus
 * install/use instructions and every terminal command) and a Live preview
 * that embeds the standalone AeroCall UI. AeroCall is a self-contained static
 * page, so the preview is a same-origin iframe (the site's global CSP and
 * X-Frame-Options otherwise block framing; /aerocall.html carries a scoped
 * exception set in staticwebapp.config.json).
 */
export function Aerocall({ onBack }: Props) {
  const [tab, setTab] = useState<'guide' | 'preview'>('guide');

  return (
    <div className="aerocall-frame">
      <div className="aerocall-bar">
        <button className="btn small" onClick={onBack}>
          ← Groundwork
        </button>
        <span className="aerocall-tag">AeroCall</span>
        <div className="aerocall-tabs">
          <button
            className={`aerocall-tabbtn${tab === 'guide' ? ' active' : ''}`}
            onClick={() => setTab('guide')}
          >
            Quick start
          </button>
          <button
            className={`aerocall-tabbtn${tab === 'preview' ? ' active' : ''}`}
            onClick={() => setTab('preview')}
          >
            Interface
          </button>
        </div>
        <div className="aerocall-bar-right">
          <a className="btn small" href="/AeroCallManual.docx" download="AeroCallManual.docx">
            Manual
          </a>
          <a className="btn small" href="/aerocall.py" target="_blank" rel="noreferrer">
            View source
          </a>
          <a className="btn small" href="/aerocall.py" download="aerocall.py">
            Download .py
          </a>
        </div>
      </div>

      {tab === 'preview' ? (
        <div className="aerocall-preview">
          <video
            className="aerocall-video aerocall-video-strip"
            src="/aerocall-tour.mp4"
            controls
            playsInline
            preload="metadata"
          >
            Your browser cannot play this video.
          </video>
          <iframe title="AeroCall" src="/aerocall.html" />
        </div>
      ) : (
        <QuickStart onOpen={() => setTab('preview')} />
      )}
    </div>
  );
}

function Cmd({ children }: { children: string }) {
  return (
    <pre className="aerocall-cmd">
      <code>{children}</code>
    </pre>
  );
}

function QuickStart({ onOpen }: { onOpen: () => void }) {
  return (
    <div className="aerocall-guide">
      <div className="aerocall-guide-inner">
        <h1>AeroCall quick start</h1>
        <p className="aerocall-lede">
          AeroCall is one Python file: an intercepting web proxy, an API workbench, and a
          copy-paste code generator. You run it in a terminal and use it in your browser. Below is
          everything from install to teardown, including every command.
        </p>

        <video className="aerocall-video" src="/aerocall-tour.mp4" controls playsInline preload="metadata">
          Your browser cannot play this video.
        </video>
        <p className="aerocall-caption">
          A short run against a safe local copy of the Groundwork app: capture the traffic, tamper a
          live request to reach the admin’s data (IDOR), fuzz a login with Intruder, surface
          reflected XSS and SQL-error findings, and decode a captured token.
        </p>

        <button className="btn btn-primary" onClick={onOpen}>
          Open the live interface
        </button>

        <div className="aerocall-callout">
          Only point AeroCall at sites and systems you own or have written permission to test. The
          proxy, Intercept, and Intruder are real testing tools.
        </div>

        <h2>1. Install Python</h2>
        <p>
          AeroCall needs Python 3.8 or newer. Check what you have first:
        </p>
        <Cmd>python3 --version</Cmd>
        <p>
          <strong>Mac:</strong> if that prints nothing or an old version, install from
          python.org/downloads (the macOS installer), or with Homebrew:
        </p>
        <Cmd>brew install python3</Cmd>
        <p>
          <strong>Windows:</strong> install from python.org/downloads and tick{' '}
          <strong>“Add Python to PATH”</strong> on the first screen. Use <code>python</code> instead
          of <code>python3</code> in the commands below, and PowerShell instead of Terminal.
        </p>

        <h2>2. Get the file</h2>
        <p>
          Click <strong>Download .py</strong> in the bar above and save <code>aerocall.py</code>{' '}
          somewhere simple, e.g. a folder called <code>aerocall</code> in your home directory. (The
          <strong> Manual</strong> button is the full 27-part guide; <strong>View source</strong>{' '}
          shows the code.)
        </p>

        <h2>3. (Recommended) install the optional add-ons</h2>
        <p>
          The core works with no extra packages. Two optional installs make it much better — HTTPS
          decryption and compressed-body decoding:
        </p>
        <Cmd>{`pip3 install cryptography
pip3 install brotli zstandard`}</Cmd>
        <p>
          Without <code>cryptography</code>, HTTPS still shows up but you see the destination, not
          the contents.
        </p>

        <h2>4. Run it</h2>
        <p>Move into the folder where you saved it, then start it:</p>
        <Cmd>{`cd ~/aerocall
python3 aerocall.py --open`}</Cmd>
        <p>
          <code>--open</code> opens the control screen in your browser. The terminal prints two
          lines that matter — the <strong>Web UI</strong> (<code>http://127.0.0.1:8081</code>) and
          the <strong>Proxy</strong> (<code>127.0.0.1:8080</code>). Leave this terminal window open;
          it is the engine. If port 8081 is busy:
        </p>
        <Cmd>python3 aerocall.py --open --ui-port 8090</Cmd>

        <h2>5. Your first call (the Builder — no setup)</h2>
        <p>
          In the control screen, the top row is <strong>Method + URL + Send</strong>. Click{' '}
          <strong>Send</strong> and the reply appears in the Response panel. The <strong>Code</strong>{' '}
          panel below writes your call as Python, JavaScript, cURL, HTTPie, or Go — click a language,
          click Copy. The request is made by the AeroCall server, so there are no CORS limits.
        </p>

        <h2>6. Watch a browser (the Proxy)</h2>
        <ol>
          <li>
            Set your browser or system proxy to <strong>127.0.0.1</strong> port <strong>8080</strong>{' '}
            for both HTTP and HTTPS. On Mac: System Settings → Network → Wi-Fi → Details → Proxies →
            turn on “Web proxy (HTTP)” and “Secure web proxy (HTTPS)”, both{' '}
            <code>127.0.0.1 : 8080</code>, leave “requires password” off.
          </li>
          <li>Browse to a site you own or are allowed to test — its requests stream into Traffic.</li>
        </ol>
        <p>
          <strong>To read HTTPS</strong>, install <code>cryptography</code> (step 3), then trust
          AeroCall’s certificate:
        </p>
        <ol>
          <li>Click the <strong>CA certificate</strong> button in the control screen to download it.</li>
          <li>
            <strong>Mac:</strong> open it → it lands in Keychain Access (choose the{' '}
            <strong>login</strong> keychain) → find “aerocall Root CA” → double-click → expand{' '}
            <strong>Trust</strong> → set “When using this certificate: <strong>Always Trust</strong>”
            → close and confirm with your password.
          </li>
          <li>
            <strong>Firefox</strong> keeps its own store: Settings → Privacy &amp; Security →
            Certificates → View Certificates → Authorities → Import → tick “Trust this CA to identify
            websites.”
          </li>
        </ol>

        <h2>7. If HTTPS calls fail with a certificate error</h2>
        <p>
          If requests error with <code>CERTIFICATE_VERIFY_FAILED / unable to get local issuer
          certificate</code>, that means Python on your machine has no root-certificate bundle, so
          it can’t verify real sites. Two fixes.
        </p>
        <p>
          <strong>Quick (get going now)</strong> — restart AeroCall telling it not to verify the far
          server:
        </p>
        <Cmd>python3 aerocall.py --open --insecure</Cmd>
        <p>
          <strong>Proper (do it once, then you never need <code>--insecure</code>)</strong> — give
          Python its certificate bundle:
        </p>
        <Cmd>pip3 install --upgrade certifi</Cmd>
        <p>
          On a python.org install you can instead double-click{' '}
          <strong>Applications → Python 3.x → “Install Certificates.command.”</strong> Then restart
          normally with <code>python3 aerocall.py --open</code>.
        </p>

        <h2>8. Use it from your phone</h2>
        <Cmd>python3 aerocall.py --lan --open</Cmd>
        <p>
          Then click <strong>Phone setup</strong> and scan the QR codes. With <code>--lan</code> the
          terminal prints a link ending in <code>?t=…</code> — a secret token. Open AeroCall using
          that exact link; it keeps other people on your Wi-Fi out of the control screen and your
          captured traffic (the phone gets the token from the QR code automatically). Only use{' '}
          <code>--lan</code> on Wi-Fi you trust.
        </p>

        <h2>9. Turn it off (do both, or browsing breaks)</h2>
        <ol>
          <li>
            <strong>Turn off the proxy first:</strong> back in System Settings → Network → Wi-Fi →
            Details → Proxies, switch both toggles off and click OK. Otherwise pages fail once
            AeroCall stops.
          </li>
          <li>
            <strong>Stop AeroCall:</strong> click its terminal window and press{' '}
            <strong>Ctrl+C</strong> (still Ctrl, not Cmd, on Mac), or close the window.
          </li>
          <li>
            <strong>When fully done, remove the certificate:</strong> Keychain Access → login →
            “aerocall Root CA” → right-click → Delete. Leaving a trusted interception CA installed is
            a standing risk.
          </li>
        </ol>

        <div className="aerocall-callout muted">
          The other tools live in the top bar once it’s running: <strong>Intercept</strong> (pause and
          edit a request), <strong>Rules</strong> (auto find/replace), <strong>Decode</strong>{' '}
          (JWT/base64/hex), <strong>Findings</strong> (passive security checks), <strong>Intruder</strong>{' '}
          (replay with a payload list), <strong>Cookies</strong>, <strong>Saved</strong>, and{' '}
          <strong>Export HAR</strong>.
        </div>
      </div>
    </div>
  );
}
