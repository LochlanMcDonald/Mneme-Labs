import { LOGIN_URL, LOGOUT_URL, type AuthState } from '../state/auth';
import type { SyncStatus } from '../state/sync';

const SYNC_LABELS: Record<SyncStatus, string> = {
  idle: '',
  saving: 'Saving to your account…',
  saved: 'Saved to your account',
  error: "Couldn't reach your account. Changes are kept on this device.",
};

/** Sign-in / signed-in controls. Renders nothing where accounts are unavailable. */
export function AccountControls({ auth, sync }: { auth: AuthState; sync: SyncStatus }) {
  if (auth.status === 'checking' || auth.status === 'unavailable') return null;

  if (auth.status === 'signed-out') {
    return (
      <div className="account">
        <a className="btn" href={LOGIN_URL}>
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
      <a className="btn btn-small" href={LOGOUT_URL}>
        Sign out
      </a>
    </div>
  );
}
