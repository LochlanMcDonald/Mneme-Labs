// Integration with Azure Static Web Apps built-in authentication.
//
// On Azure, /.auth/me reports the signed-in user (or null when signed out).
// On hosts without SWA auth (Netlify previews, local vite), the endpoint is
// missing, so the app detects that and runs in local-only mode.

export interface AuthUser {
  userId: string;
  userDetails: string;
  identityProvider: string;
}

export type AuthStatus = 'checking' | 'unavailable' | 'signed-out' | 'signed-in';

export interface AuthState {
  status: AuthStatus;
  user: AuthUser | null;
}

export const LOGIN_URL = '/.auth/login/aad?post_login_redirect_uri=/';
export const LOGOUT_URL = '/.auth/logout?post_logout_redirect_uri=/';

/**
 * Where the account-enabled deployment lives (the Azure Static Web App).
 * Set at build time via VITE_ACCOUNT_URL. On hosts without SWA auth, the
 * sign-in button links here so accounts are reachable from any copy of
 * the site; when unset, those hosts show no sign-in UI at all.
 */
export const ACCOUNT_URL: string =
  ((import.meta.env.VITE_ACCOUNT_URL as string | undefined) ?? '').replace(/\/+$/, '');

export const REMOTE_LOGIN_URL = ACCOUNT_URL
  ? `${ACCOUNT_URL}/.auth/login/aad?post_login_redirect_uri=/`
  : '';

export async function fetchAuth(): Promise<AuthState> {
  try {
    const res = await fetch('/.auth/me', { headers: { accept: 'application/json' } });
    const contentType = res.headers.get('content-type') ?? '';
    if (!res.ok || !contentType.includes('json')) {
      return { status: 'unavailable', user: null };
    }
    const data = await res.json();
    const cp = data?.clientPrincipal;
    if (cp && typeof cp.userId === 'string') {
      return {
        status: 'signed-in',
        user: {
          userId: cp.userId,
          userDetails: String(cp.userDetails ?? ''),
          identityProvider: String(cp.identityProvider ?? ''),
        },
      };
    }
    return { status: 'signed-out', user: null };
  } catch {
    return { status: 'unavailable', user: null };
  }
}
