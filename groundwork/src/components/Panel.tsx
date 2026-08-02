import { useState } from 'react';
import { BrandMark } from './BrandMark';
import { loginUrl, remoteLoginUrl, type AuthState } from '../state/auth';
import { panelCheckoutUrl, panelDownloadUrl, type Me } from '../state/pro';

interface Props {
  onBack: () => void;
  onStart: () => void;
  auth: AuthState;
  me: Me | null;
}

const CONSOLES = [
  { name: 'Microsoft Defender', dot: '#2f6bff' },
  { name: 'Microsoft Sentinel', dot: '#ff8b3d' },
  { name: 'CrowdStrike Falcon', dot: '#ff5f8f' },
  { name: 'Proofpoint TRAP', dot: '#2f6bff' },
  { name: 'Google Workspace', dot: '#58b32c' },
  { name: 'GitHub', dot: '#8b5cf6' },
];

const DOWNLOADS: { key: 'mac-arm64' | 'mac-x64' | 'win-x64'; label: string }[] = [
  { key: 'mac-arm64', label: 'Mac, Apple silicon' },
  { key: 'mac-x64', label: 'Mac, Intel' },
  { key: 'win-x64', label: 'Windows' },
];

const PRICE = '$14.99';

/** The subscribe / download area, keyed on account state. */
function GetPanel({ auth, me }: { auth: AuthState; me: Me | null }) {
  const [error, setError] = useState('');
  const [busy, setBusy] = useState('');

  const download = async (key: 'mac-arm64' | 'mac-x64' | 'win-x64') => {
    setError('');
    setBusy(key);
    try {
      window.location.assign(await panelDownloadUrl(key));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Download failed');
    } finally {
      setBusy('');
    }
  };

  if (auth.status === 'checking') {
    return <p className="help-sub">Checking your account…</p>;
  }

  // Hosts without accounts (mirrors) send people to the account site.
  if (auth.status === 'unavailable') {
    const remote = remoteLoginUrl();
    return (
      <div className="panel-get">
        <p>
          Panel is {PRICE} a month. Sign in on the account site to subscribe and download.
        </p>
        {remote && (
          <a className="btn btn-primary" href={remote}>
            Sign in with Microsoft
          </a>
        )}
      </div>
    );
  }

  if (auth.status === 'signed-out') {
    return (
      <div className="panel-get">
        <p>
          Panel is {PRICE} a month. Sign in first so your subscription lands on your account,
          then you can download for Mac and Windows.
        </p>
        <a className="btn btn-primary" href={loginUrl()}>
          Sign in with Microsoft
        </a>
      </div>
    );
  }

  if (me?.panel || me?.admin) {
    return (
      <div className="panel-get">
        <p>Your Panel subscription is active. Download for your machine:</p>
        <div className="panel-downloads">
          {DOWNLOADS.map((d) => (
            <button
              key={d.key}
              className="btn btn-primary"
              disabled={busy !== ''}
              onClick={() => download(d.key)}
            >
              {busy === d.key ? 'Preparing…' : d.label}
            </button>
          ))}
        </div>
        {error && <p className="advisor-error">{error}</p>}
      </div>
    );
  }

  const checkout = panelCheckoutUrl(me?.userId ?? '', me?.userDetails ?? '');
  return (
    <div className="panel-get">
      <p>
        Panel is {PRICE} a month, billed through Stripe, cancel anytime. After paying, come
        back to this page and your downloads unlock within a minute.
      </p>
      {checkout ? (
        <a className="btn btn-primary" href={checkout}>
          Subscribe for {PRICE}/month
        </a>
      ) : (
        <p className="help-sub">Subscriptions are not enabled on this copy of the site.</p>
      )}
    </div>
  );
}

/**
 * Product page for Groundwork Panel, the downloadable console dashboard.
 * Downloads are issued by the account API as short-lived links, only to
 * subscribers; installers themselves live in private storage.
 */
export function Panel({ onBack, onStart, auth, me }: Props) {
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
        <h1>Every security console. One glance.</h1>
        <p className="content-lede">
          Groundwork Panel is a small desktop app that watches all of your security tools at
          once. Each vendor gets a tile showing how many new alerts are waiting, and one click
          drops you into the right console. No more opening six tabs every morning to find out
          whether anything happened.
        </p>
      </header>

      <section className="content-section">
        <h2>Your keys never leave your machine.</h2>
        <p>
          Panel talks directly from your computer to each vendor's own API. Credentials are
          stored in a file on your machine, readable only by you, and are never sent anywhere
          except to the vendor they belong to. Groundwork's servers never see your keys, your
          alerts, or anything else. That is the whole design: tools like this usually ask you
          to hand your security credentials to somebody's cloud, and Panel exists so you do not
          have to.
        </p>
        <div className="panel-consoles">
          {CONSOLES.map((c) => (
            <span className="panel-console" key={c.name}>
              <span className="panel-dot" style={{ background: c.dot }} />
              {c.name}
            </span>
          ))}
        </div>
      </section>

      <section className="content-section">
        <h2>Get Panel.</h2>
        <p>
          It runs on Apple silicon and Intel Macs and on Windows 10 and 11, and opens with
          demo data so you can look around before adding any keys.
        </p>
        <GetPanel auth={auth} me={me} />
      </section>

      <section className="content-section">
        <h2>The first open takes one extra step.</h2>
        <p>
          Early access builds are not yet code-signed, so your computer will warn you the
          first time. That warning is your operating system doing its job, and here is how to
          get past it once you have decided to trust us. On a Mac: if it says the app could
          not be verified, click Done, then open System Settings, go to Privacy &amp;
          Security, scroll to the Security section, and click Open Anyway next to Groundwork
          Panel. On Windows: when SmartScreen appears, click More info, then Run anyway.
          Signed builds are coming and this step disappears with them.
        </p>
      </section>

      <section className="content-section">
        <h2>Panel pairs with your plan.</h2>
        <p>
          The security plan tells you what to set up. Panel tells you what those tools are
          seeing once they are running. If you have not built your plan yet, that is the place
          to start.
        </p>
        <button className="btn btn-primary" onClick={onStart}>
          Build my security plan
        </button>
      </section>
    </div>
  );
}
