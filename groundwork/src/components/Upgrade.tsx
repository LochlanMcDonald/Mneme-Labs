import { UPGRADE_URL } from '../state/pro';
import { remoteLoginUrl, type AuthState } from '../state/auth';

const PERKS = [
  {
    title: 'Your personalized security report',
    body: 'A polished, branded PDF of your security posture: readiness score, category breakdown, and your full plan. Built to hand to enterprise customers, insurers, and investors.',
  },
  {
    title: 'A security advisor in your corner',
    body: 'Ask questions, sanity-check decisions, or get guidance during an incident. Real humans answer within one business day, with your plan already in front of them.',
  },
];

/**
 * The Pro pitch, shown wherever a non-Pro user meets a Pro feature.
 * Signed-out users are pointed at sign-in first.
 */
export function Upgrade({ auth }: { auth: AuthState }) {
  const signedIn = auth.status === 'signed-in';
  const remote = remoteLoginUrl();

  return (
    <div className="upgrade">
      <span className="pro-badge">PRO</span>
      <h2>Groundwork Pro</h2>
      <p className="upgrade-lede">
        Everything in the free plan, plus the proof and the people for when
        security starts affecting deals.
      </p>
      <div className="upgrade-perks">
        {PERKS.map((perk) => (
          <div className="step-card" key={perk.title}>
            <h3>{perk.title}</h3>
            <p>{perk.body}</p>
          </div>
        ))}
      </div>
      {!signedIn ? (
        <p className="upgrade-note">
          {remote ? (
            <>
              <a className="btn btn-primary" href={remote}>
                Sign in to get started
              </a>
            </>
          ) : (
            'Sign in on the app to get started with Pro.'
          )}
        </p>
      ) : UPGRADE_URL ? (
        <a className="btn btn-primary btn-lg" href={UPGRADE_URL}>
          Upgrade to Pro
        </a>
      ) : (
        <p className="upgrade-note">
          Pro is in early access and rolling out gradually. Check back soon.
        </p>
      )}
    </div>
  );
}
