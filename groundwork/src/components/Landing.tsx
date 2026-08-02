import { useState } from 'react';
import { AccountControls } from './Account';
import { BrandMark } from './BrandMark';
import { Upgrade } from './Upgrade';
import type { AuthState } from '../state/auth';
import type { SyncStatus } from '../state/sync';

interface Props {
  onStart: () => void;
  onHelp: () => void;
  onTerms: () => void;
  onPrivacy: () => void;
  onAbout: () => void;
  onCoverage: () => void;
  onPanel: () => void;
  /** Set when a saved plan exists; the CTAs open it instead of the wizard. */
  onMyPlan: (() => void) | null;
  auth: AuthState;
  sync: SyncStatus;
}

const STEPS = [
  {
    title: 'Tell us about your startup',
    body: 'Five minutes of plain questions. Nothing you need to google before you can answer.',
  },
  {
    title: 'Get a tailored roadmap',
    body: 'Your answers rule out most of the advice on the internet. What is left is the work that actually applies to a company built like yours, in the order it should happen.',
  },
  {
    title: 'Work through it, step by step',
    body: 'Each item tells you what it protects you from and how long it takes. Tick things off as you go, and export the whole thing when somebody asks to see it.',
  },
];

const FRAMEWORKS = [
  'SOC 2',
  'ISO 27001',
  'CIS Controls',
  'GDPR',
  'HIPAA',
  'PCI DSS',
  'OWASP',
];

export function Landing({
  onStart,
  onHelp,
  onTerms,
  onPrivacy,
  onAbout,
  onCoverage,
  onPanel,
  onMyPlan,
  auth,
  sync,
}: Props) {
  // Phone widths hide the inline links, so a menu button stands in.
  const [menuOpen, setMenuOpen] = useState(false);
  const go = (fn: () => void) => () => {
    setMenuOpen(false);
    fn();
  };

  return (
    <div className="landing">
      <nav className="nav">
        <div className="nav-inner">
          <div className="brand nav-brand">
            <BrandMark className="brand-mark" />
            Groundwork
          </div>
          <div className="nav-links">
            <button className="nav-link" onClick={onCoverage}>
              What&apos;s covered
            </button>
            <button className="nav-link" onClick={onPanel}>
              Panel
            </button>
            <button className="nav-link" onClick={onAbout}>
              About
            </button>
            <button className="nav-link nav-link-wide" onClick={onHelp}>
              Help &amp; FAQs
            </button>
            <button
              className="btn nav-burger"
              aria-label="Menu"
              aria-expanded={menuOpen}
              onClick={() => setMenuOpen((o) => !o)}
            >
              ☰
            </button>
            <button className="btn btn-primary btn-small" onClick={onMyPlan ?? onStart}>
              {onMyPlan ? 'My plan' : 'Get my plan'}
            </button>
          </div>
        </div>
        {menuOpen && (
          <div className="nav-menu">
            <button className="nav-menu-link" onClick={go(onCoverage)}>
              What&apos;s covered
            </button>
            <button className="nav-menu-link" onClick={go(onPanel)}>
              Panel
            </button>
            <button className="nav-menu-link" onClick={go(onAbout)}>
              About
            </button>
            <button className="nav-menu-link" onClick={go(onHelp)}>
              Help &amp; FAQs
            </button>
          </div>
        )}
      </nav>

      <header className="landing-hero hero-left">
        <div className="hero-copy">
          <div className="hero-eyebrow">
            <span className="hero-dot" />
            For companies with no security team and no time to build one
          </div>
          <h1>
            Startup security, sorted.<br />
            Without the hassle.
          </h1>
          <p className="lede">
            Answer a few quick questions about your company and get a security
            plan, free. Sign in below to save it, and if you ever want a real
            security advisor to weigh in, you can.
          </p>
          <button className="btn btn-primary btn-lg" onClick={onMyPlan ?? onStart}>
            {onMyPlan ? 'Open my security plan' : 'Build my security plan'}
          </button>
          <div className="landing-account">
            <AccountControls auth={auth} sync={sync} />
          </div>
        </div>
      </header>

      <section className="trust">
        <p className="trust-label">
          Cross-referenced to the standards your customers will ask about
        </p>
        <ul className="trust-list">
          {FRAMEWORKS.map((f) => (
            <li key={f}>{f}</li>
          ))}
        </ul>
      </section>

      <section className="landing-steps steps-rail">
        <h2 className="steps-title">How it works</h2>
        {STEPS.map((step, i) => (
          <div className="step-card" key={step.title}>
            <div className="step-num">{i + 1}</div>
            <h3>{step.title}</h3>
            <p>{step.body}</p>
          </div>
        ))}
      </section>

      <section className="landing-video">
        <video controls playsInline preload="metadata" poster="demo-poster.jpg">
          <source src="demo.mp4" type="video/mp4" />
          Your browser doesn't support embedded video.
        </video>
      </section>

      <section className="landing-beyond">
        <h2>For the bad days too</h2>
        <p className="landing-beyond-sub">
          Setting things up is the easy half. We also cover what happens when
          something has already gone wrong.
        </p>
        <div className="beyond-grid">
          <div className="step-card">
            <h3>Help after an incident</h3>
            <p>
              Somebody clicked the wrong link, a key ended up in a public repo,
              a laptop went missing. There is a playbook for each one that
              starts with what to do in the first ten minutes and who you need
              to tell.
            </p>
          </div>
          <div className="step-card">
            <h3>Answers along the way</h3>
            <p>
              How much should any of this cost. Who owns it when nobody has the
              word security in their title. Whether you are ready for SOC 2 or
              being sold it too early. Answered like a colleague would.
            </p>
          </div>
        </div>
        <button className="btn btn-lg" onClick={onHelp}>
          Browse incident help &amp; FAQs
        </button>
      </section>

      <section className="landing-panel">
        <h2>Watch every console from one board.</h2>
        <p className="landing-panel-sub">
          Groundwork Panel is our desktop app for when your security tools
          multiply. New alert counts from Defender, Sentinel, CrowdStrike and
          more on one screen, one click into the right console, and your API
          keys never leave your machine.
        </p>
        <img
          className="panel-shot"
          src="panel-board.webp"
          width={1600}
          height={950}
          loading="lazy"
          alt="The Groundwork Panel board: six console tiles showing new alert counts and severity chips"
        />
        <button className="btn btn-lg" onClick={onPanel}>
          Meet Groundwork Panel
        </button>
      </section>

      <section className="landing-pro">
        <Upgrade auth={auth} />
      </section>

      <footer className="landing-footer footer-cols">
        <div className="footer-brand">
          <div className="brand small">
            <BrandMark className="brand-mark" />
            Groundwork
          </div>
          <p>
            We help young companies get their security footing before somebody
            forces the issue.
          </p>
        </div>
        <div className="footer-col">
          <span className="footer-col-title">Product</span>
          <button className="link-btn" onClick={onCoverage}>
            What&apos;s covered
          </button>
          <button className="link-btn" onClick={onPanel}>
            Groundwork Panel
          </button>
          <button className="link-btn" onClick={onHelp}>
            Help &amp; FAQs
          </button>
          <button className="link-btn" onClick={onStart}>
            Get my plan
          </button>
        </div>
        <div className="footer-col">
          <span className="footer-col-title">Company</span>
          <button className="link-btn" onClick={onAbout}>
            About
          </button>
          <a href="mailto:support@groundwork-security.com">Contact</a>
        </div>
        <div className="footer-col">
          <span className="footer-col-title">Legal</span>
          <button className="link-btn" onClick={onTerms}>
            Terms of Service
          </button>
          <button className="link-btn" onClick={onPrivacy}>
            Privacy Policy
          </button>
        </div>
      </footer>
    </div>
  );
}
