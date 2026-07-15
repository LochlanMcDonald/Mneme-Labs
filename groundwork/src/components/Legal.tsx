import type { ReactNode } from 'react';

interface Props {
  onBack: () => void;
}

const SUPPORT = 'support@groundwork-security.com';

function LegalShell({ title, updated, onBack, children }: Props & { title: string; updated: string; children: ReactNode }) {
  return (
    <div className="legal">
      <button className="btn" onClick={onBack}>
        ← Back
      </button>
      <h1>{title}</h1>
      <p className="legal-updated">Last updated: {updated}</p>
      {children}
      <p className="legal-contact">
        Questions? Email <a href={`mailto:${SUPPORT}`}>{SUPPORT}</a>.
      </p>
    </div>
  );
}

export function Terms({ onBack }: Props) {
  return (
    <LegalShell title="Terms of Service" updated="July 15, 2026" onBack={onBack}>
      <h2>What Groundwork is</h2>
      <p>
        Groundwork helps startups plan and track their security work. The free
        plan generates a tailored security checklist from your answers and
        tracks your progress. Groundwork Pro adds a personalized security
        report and access to human security advisors.
      </p>

      <h2>What Groundwork is not</h2>
      <p>
        Groundwork provides general security guidance for educational and
        planning purposes. It is not legal advice, not a compliance
        certification, and not a guarantee that your company is secure or
        meets any regulatory requirement. Advisor responses are general
        guidance based on the information you share; they are not a substitute
        for professional incident response, legal counsel, or a formal
        security audit. You are responsible for decisions you make based on
        the service.
      </p>

      <h2>Accounts</h2>
      <p>
        You sign in with a Microsoft account. You are responsible for keeping
        that account secure. You may request deletion of your Groundwork data
        at any time by emailing {SUPPORT}.
      </p>

      <h2>Groundwork Pro</h2>
      <p>
        Pro is a paid subscription billed at $299 per year. It includes the
        personalized security report and advisor access. Advisors aim to
        respond within one business day; Pro is not an emergency hotline and
        response times are a target, not a guarantee. We may adjust pricing
        for future renewal periods with notice before you are charged.
      </p>

      <h2>Refunds</h2>
      <p>
        If Pro is not what you expected, email {SUPPORT} within 14 days of
        purchase and we will refund you in full, no questions asked. After 14
        days, refunds are at our discretion. You can cancel renewal at any
        time and keep access for the period you paid for.
      </p>

      <h2>Acceptable use</h2>
      <p>
        Do not use Groundwork to seek help attacking systems you do not own
        or have authorization to test, and do not abuse the advisor service
        or attempt to access other users' data. We may suspend accounts that
        do.
      </p>

      <h2>Disclaimer and liability</h2>
      <p>
        The service is provided as is, without warranties of any kind. To the
        maximum extent permitted by law, our total liability for any claim
        related to the service is limited to the amount you paid us in the 12
        months before the claim arose.
      </p>

      <h2>Changes</h2>
      <p>
        We may update these terms as the product evolves. Material changes
        will be noted on this page with an updated date, and continued use of
        the service after a change means you accept the new terms.
      </p>
    </LegalShell>
  );
}

export function Privacy({ onBack }: Props) {
  return (
    <LegalShell title="Privacy Policy" updated="July 15, 2026" onBack={onBack}>
      <h2>What we collect</h2>
      <p>
        If you use Groundwork without signing in, your answers and plan stay
        in your browser's local storage and are not sent to us. If you sign
        in, we store: your name and email address as provided by Microsoft
        sign-in, the answers you give in the questionnaire, your plan progress
        and notes, and any messages you send to advisors.
      </p>

      <h2>How we use it</h2>
      <p>
        To provide the service: generating your plan, syncing it across your
        devices, producing your Pro report, and answering your advisor
        requests. We do not sell your data, share it with advertisers, or use
        it for anything unrelated to running Groundwork.
      </p>

      <h2>Where it lives</h2>
      <p>
        Your data is stored on Microsoft Azure. Sign-in is handled by
        Microsoft; we never see or store your password. Payments are handled
        by our payment provider; card details never touch our systems.
      </p>

      <h2>Cookies and analytics</h2>
      <p>
        The app uses the session cookie required for sign-in and no
        third-party advertising or tracking cookies. If we add product
        analytics in the future, this policy will be updated first.
      </p>

      <h2>Retention and your rights</h2>
      <p>
        We keep your data while your account is active. Email {SUPPORT} to
        request a copy of your data or its deletion, and we will act on the
        request within 30 days.
      </p>

      <h2>Changes</h2>
      <p>
        If our data practices change, this page will be updated with a new
        date before the change takes effect.
      </p>
    </LegalShell>
  );
}
