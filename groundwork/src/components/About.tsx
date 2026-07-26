import { BrandMark } from './BrandMark';

interface Props {
  onBack: () => void;
  onStart: () => void;
}

const PRINCIPLES = [
  {
    title: 'Order beats volume',
    body: "A list of two hundred things is the same as no list. What matters is knowing the four that would actually have stopped the last breach you read about, and doing those first.",
  },
  {
    title: 'Say why, every time',
    body: "Nobody sticks to advice they do not understand. Every item here explains what it protects you from, so you can push back on the ones that do not fit and mean it when you skip them.",
  },
  {
    title: 'Fit the company you are',
    body: 'A four-person team shipping a web app does not need the control set of a bank. Your plan is cut to what you build, what data you hold, and who buys from you.',
  },
  {
    title: 'No shaming',
    body: "Being behind on security is the default state of a young company, not a character flaw. The job is to get you moving, not to make you feel bad about where you started.",
  },
];

export function About({ onBack, onStart }: Props) {
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
        <h1>Security advice that survives contact with a real startup.</h1>
        <p className="content-lede">
          Groundwork exists because the gap between "we should probably do
          security" and "we know exactly what to do on Monday" swallows a lot of
          good companies.
        </p>
      </header>

      <section className="content-section">
        <h2>Where this comes from</h2>
        <p>
          I have spent my career in the security function of an enterprise that
          measures revenue in the billions. These days I work as a lead
          automation security analyst, and I am constantly building solutions that make
          the work easier and more efficient for my team.
        </p>
        <p>
          Large companies get there in the end because they can throw people at
          the problem. They have teams who read the frameworks, argue about
          scope, and turn all of it into a checklist somebody actually owns. A
          startup has none of that. It has a founder with a product to ship and
          a customer asking, out of nowhere, how their data is protected.
        </p>
        <p>
          The advice that reaches those founders is usually written for the
          companies I work in. It assumes a budget, a security hire, and time to
          read a hundred-page standard. So it gets skimmed and forgotten, and the
          same avoidable things keep going wrong.
        </p>
      </section>

      <section className="content-section">
        <h2>What we are trying to do</h2>
        <p>
          Groundwork takes the way a mature security program actually decides
          what to work on and hands it to a company that cannot afford one. You
          answer plain questions about your business. You get back a short,
          ordered plan with the reasoning attached, and a way to keep track as
          you work through it.
        </p>
        <p>
          The goal is not to make you an expert. It is to get the boring,
          high-impact work done early, while it is still cheap, so that
          security never becomes the reason a deal stalls or a bad week turns
          into a bad quarter. If you outgrow us and hire someone properly, we
          have done our job.
        </p>
      </section>

      <section className="content-section">
        <h2>How we think about it</h2>
        <div className="principle-grid">
          {PRINCIPLES.map((p) => (
            <div className="step-card" key={p.title}>
              <h3>{p.title}</h3>
              <p>{p.body}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="content-cta">
        <h2>Start where you are</h2>
        <p>
          It takes about five minutes and costs nothing. You will end up with a
          shorter list than you expect.
        </p>
        <button className="btn btn-primary btn-lg" onClick={onStart}>
          Build my security plan
        </button>
      </section>
    </div>
  );
}
