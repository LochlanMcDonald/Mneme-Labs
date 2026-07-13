import { loginUrl, logoutUrl, remoteLoginUrl, type AuthState } from '../state/auth';
import type { SyncStatus } from '../state/sync';

const SYNC_LABELS: Record<SyncStatus, string> = {
  idle: '',
  saving: 'Saving to your account…',
  saved: 'Saved to your account',
  error: "Couldn't reach your account. Changes are kept on this device.",
};

/**
 * Sign-in / signed-in controls. On hosts without SWA auth, links to the
 * account-enabled deployment when one is configured; otherwise renders
 * nothing.
 */
export function AccountControls({ auth, sync }: { auth: AuthState; sync: SyncStatus }) {
  if (auth.status === 'checking') return null;

  if (auth.status === 'unavailable') {
    const remote = remoteLoginUrl();
    if (!remote) return null;
    return (
      <div className="account">
        <a className="btn" href={remote}>
          Sign in with Microsoft
        </a>
        <span className="account-hint">
          Sign in to save your plan and open it from any device.
        </span>
      </div>
    );
  }

  if (auth.status === 'signed-out') {
    return (
      <div className="account">
        <a className="btn" href={loginUrl()}>
          Sign in with Microsoft
        </a>
        <span className="account-hint">
          Sign in to save your plan and open it from any device.
        </span>
      </div>
    );
  }

  return (
    <div className="account">
      <span className="account-user">{auth.user?.userDetails || 'Signed in'}</span>
      {sync !== 'idle' && (
        <span className={`account-sync ${sync === 'error' ? 'error' : ''}`}>
          {SYNC_LABELS[sync]}
        </span>
      )}
      <a className="btn btn-small" href={logoutUrl()}>
        Sign out
      </a>
    </div>
  );
}
