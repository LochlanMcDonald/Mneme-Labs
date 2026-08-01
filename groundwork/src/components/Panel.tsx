import { BrandMark } from './BrandMark';

interface Props {
  onBack: () => void;
  onStart: () => void;
}

const RELEASE = 'https://github.com/LochlanMcDonald/Mneme-Labs/releases/download/panel-v0.1.0';

const CONSOLES = [
  { name: 'Microsoft Defender', dot: '#2f6bff' },
  { name: 'Microsoft Sentinel', dot: '#ff8b3d' },
  { name: 'CrowdStrike Falcon', dot: '#ff5f8f' },
  { name: 'Proofpoint TRAP', dot: '#2f6bff' },
  { name: 'Google Workspace', dot: '#58b32c' },
  { name: 'GitHub', dot: '#8b5cf6' },
];

/**
 * Product page for Groundwork Panel, the downloadable console dashboard.
 * Download links point at the public GitHub release for the version named
 * in groundwork-panel/RELEASE_TAG.
 */
export function Panel({ onBack, onStart }: Props) {
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
        <h2>Download the early access preview.</h2>
        <p>
          Free while in early access. Panel becomes its own subscription when it leaves
          preview, and the consoles above all work today. It runs on Apple silicon and Intel
          Macs and on Windows 10 and 11, and opens with demo data so you can look around
          before adding any keys.
        </p>
        <div className="panel-downloads">
          <a className="btn btn-primary" href={`${RELEASE}/groundwork-panel-0.1.0-mac-arm64.dmg`}>
            Mac, Apple silicon
          </a>
          <a className="btn btn-primary" href={`${RELEASE}/groundwork-panel-0.1.0-mac-x64.dmg`}>
            Mac, Intel
          </a>
          <a className="btn btn-primary" href={`${RELEASE}/groundwork-panel-0.1.0-win-x64.exe`}>
            Windows
          </a>
        </div>
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
