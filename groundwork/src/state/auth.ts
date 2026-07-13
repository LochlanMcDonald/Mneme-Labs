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

/** Path of the current page, so sign-in and sign-out return the user here. */
function herePath(): string {
  return typeof window === 'undefined' ? '/' : window.location.pathname;
}

export function loginUrl(): string {
  return `/.auth/login/aad?post_login_redirect_uri=${encodeURIComponent(herePath())}`;
}

export function logoutUrl(): string {
  return `/.auth/logout?post_logout_redirect_uri=${encodeURIComponent(herePath())}`;
}

/**
 * Where the account-enabled app lives (its URL on the Azure Static Web
 * App, including any path). Set at build time via VITE_ACCOUNT_URL. On
 * hosts without SWA auth, the sign-in button links there so accounts are
 * reachable from any copy of the site; when unset, those hosts show no
 * sign-in UI at all.
 */
export const ACCOUNT_URL: string =
  ((import.meta.env.VITE_ACCOUNT_URL as string | undefined) ?? '').trim();

export function remoteLoginUrl(): string {
  if (!ACCOUNT_URL) return '';
  try {
    const target = new URL(ACCOUNT_URL);
    const path = target.pathname.endsWith('/') ? target.pathname : `${target.pathname}/`;
    return `${target.origin}/.auth/login/aad?post_login_redirect_uri=${encodeURIComponent(path)}`;
  } catch {
    return '';
  }
}

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
