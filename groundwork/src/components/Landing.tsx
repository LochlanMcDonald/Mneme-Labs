interface Props {
  onStart: () => void;
}

const STEPS = [
  {
    title: 'Tell us about your startup',
    body: 'A five-minute questionnaire: what you build, what data you handle, what systems you run, and who your customers are.',
  },
  {
    title: 'Get a tailored roadmap',
    body: 'We match your answers against a knowledge base of startup-sized security controls — baseline essentials for everyone, plus the ones your specific setup demands.',
  },
  {
    title: 'Work through it, step by step',
    body: 'Every item explains the risk, the concrete steps, the effort, and tools to use. Track progress, add notes, and export the plan when a customer or auditor asks.',
  },
];

export function Landing({ onStart }: Props) {
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
          Startup security, sorted —<br />
          without the hassle.
        </h1>
        <p className="lede">
          Answer a few questions about your company and get a prioritized,
          plain-language security roadmap: what to do this week, this month,
          this quarter — and why.
        </p>
        <button className="btn btn-primary btn-lg" onClick={onStart}>
          Build my security plan
        </button>
        <p className="privacy-note">
          Everything stays in your browser. Nothing you enter leaves this page.
        </p>
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

      <footer className="landing-footer">
        Built for founders, not CISOs. Framework mappings included for when
        SOC 2 or ISO 27001 come knocking.
      </footer>
    </div>
  );
}
