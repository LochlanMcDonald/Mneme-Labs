import { AccountControls } from './Account';
import { Upgrade } from './Upgrade';
import type { AuthState } from '../state/auth';
import type { SyncStatus } from '../state/sync';

interface Props {
  onStart: () => void;
  onHelp: () => void;
  auth: AuthState;
  sync: SyncStatus;
}

const STEPS = [
  {
    title: 'Tell us about your startup',
    body: 'A five-minute questionnaire: what you build, what data you handle, what systems you run, and who your customers are.',
  },
  {
    title: 'Get a tailored roadmap',
    body: 'We match your answers against a knowledge base of startup-sized security controls: baseline essentials for everyone, plus the ones your specific setup demands.',
  },
  {
    title: 'Work through it, step by step',
    body: 'Every item explains the risk, the concrete steps, the effort, and tools to use. Track progress, add notes, and export the plan when a customer or auditor asks.',
  },
];

export function Landing({ onStart, onHelp, auth, sync }: Props) {
  return (
    <div className="landing">
      <header className="landing-hero">
        <div className="brand">
          <span className="brand-mark" aria-hidden>
            ⬢
          </span>
          Groundwork
        </div>
        <h1>
          Startup security, sorted.<br />
          Without the hassle.
        </h1>
        <p className="lede">
          Answer a few questions about your company and get a prioritized,
          plain-language security roadmap: what to do this week, this month,
          this quarter, and why.
        </p>
        <button className="btn btn-primary btn-lg" onClick={onStart}>
          Build my security plan
        </button>
        <div className="landing-account">
          <AccountControls auth={auth} sync={sync} />
        </div>
      </header>

      <section className="landing-steps">
        {STEPS.map((step, i) => (
          <div className="step-card" key={step.title}>
            <div className="step-num">{i + 1}</div>
            <h3>{step.title}</h3>
            <p>{step.body}</p>
          </div>
        ))}
      </section>

      <section className="landing-video">
        <h2>See it in action</h2>
        <p className="landing-video-sub">
          From first question to finished plan, in under a minute.
        </p>
        <video controls playsInline preload="metadata" poster="demo-poster.jpg">
          <source src="demo.mp4" type="video/mp4" />
          Your browser doesn't support embedded video.
        </video>
      </section>

      <section className="landing-beyond">
        <h2>More than a checklist</h2>
        <p className="landing-beyond-sub">
          Getting set up is half the story. We're also there for the messy
          moments and the questions in between.
        </p>
        <div className="beyond-grid">
          <div className="step-card">
            <h3>Help after an incident</h3>
            <p>
              Phished account, leaked key, lost laptop, exposed data:
              step-by-step first-aid playbooks for the moments when something
              has already gone wrong, including who to call and what to do
              first.
            </p>
          </div>
          <div className="step-card">
            <h3>Answers along the way</h3>
            <p>
              Straight answers to the questions founders actually ask: what
              to spend, who should own security, when SOC 2 makes sense, and
              how to handle customer security questionnaires.
            </p>
          </div>
        </div>
        <button className="btn btn-lg" onClick={onHelp}>
          Browse incident help &amp; FAQs
        </button>
      </section>

      <section className="landing-pro">
        <Upgrade auth={auth} />
      </section>

      <footer className="landing-footer">
        We're dedicated to helping startups get their security footing:
        clear priorities, concrete steps, and a plan that grows with you.
      </footer>
    </div>
  );
}
