import { UPGRADE_URL, checkoutUrl } from '../state/pro';
import { loginUrl, remoteLoginUrl, type AuthState } from '../state/auth';

const PERKS = [
  {
    title: 'A report you can hand over',
    body: 'One clean document showing where you stand and what you have done about it. Built for the moment a customer, insurer, or investor asks you to prove it.',
  },
  {
    title: 'Someone to ask',
    body: 'Send over a question, a decision you want checked, or something that just went wrong. A person replies inside a business day, and they can already see your plan.',
  },
];

/**
 * The Pro pitch, shown wherever a non-Pro user meets a Pro feature.
 * Signed-out users are pointed at sign-in first.
 */
export function Upgrade({ auth }: { auth: AuthState }) {
  const signedIn = auth.status === 'signed-in';
  // On the auth-enabled host use the local login; on hosts without SWA auth
  // (Netlify, previews) hand off to the account-enabled deployment.
  const signInHref = auth.status === 'unavailable' ? remoteLoginUrl() : loginUrl();

  return (
    <div className="upgrade">
      <span className="pro-badge">PRO</span>
      <h2>Groundwork Pro</h2>
      <p className="upgrade-lede">
        Everything in the free plan. Then the paperwork and the backup for
        when security starts holding up deals.
      </p>
      <div className="upgrade-price">
        <span className="upgrade-price-num">$19.99</span>
        <span className="upgrade-price-per">per month</span>
      </div>
      <p className="upgrade-guarantee">14-day money-back guarantee.</p>
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
          {signInHref ? (
            <>
              <a className="btn btn-primary" href={signInHref}>
                Sign in to get started
              </a>
            </>
          ) : (
            'Sign in on the app to get started with Pro.'
          )}
        </p>
      ) : UPGRADE_URL ? (
        <a
          className="btn btn-primary btn-lg"
          href={checkoutUrl(auth.user?.userId ?? '', auth.user?.userDetails ?? '')}
        >
          Upgrade to Pro
        </a>
      ) : (
        <p className="upgrade-note">
          Pro is in early access. Email{' '}
          <a href="mailto:support@groundwork-security.com?subject=Groundwork%20Pro">
            support@groundwork-security.com
          </a>{' '}
          and we'll set you up.
        </p>
      )}
    </div>
  );
}
