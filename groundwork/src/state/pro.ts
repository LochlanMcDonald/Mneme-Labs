// Groundwork Pro: entitlement lookup and advisor requests.

export interface Me {
  userId: string;
  userDetails: string;
  pro: boolean;
  /** Groundwork Panel subscription. */
  panel: boolean;
  admin: boolean;
}

export interface AssistRequest {
  id: string;
  subject: string;
  message: string;
  status: string;
  createdAt: string;
  answer: string;
  answeredAt: string;
}

/** An advisor request as seen by an admin, including who sent it. */
export interface AdminAssistRequest extends AssistRequest {
  userId: string;
  userDetails: string;
}

/** One signed-in account, as shown on the admin page. */
export interface AdminUserRow {
  userId: string;
  userDetails: string;
  /** First save on this account. Empty for accounts that predate tracking. */
  createdAt: string;
  updatedAt: string;
  hasPlan: boolean;
  pro: boolean;
}

export interface AdminStats {
  totalUsers: number;
  withPlan: number;
  proUsers: number;
  users: AdminUserRow[];
}

export interface AdminOverview {
  requests: AdminAssistRequest[];
  /** Null when the stats query failed server-side; requests still load. */
  stats: AdminStats | null;
}

/**
 * Optional checkout link (e.g. a Stripe Payment Link), baked in at build
 * time. When unset, the upgrade pitch shows an early-access note instead
 * of a buy button.
 */
export const UPGRADE_URL: string =
  ((import.meta.env.VITE_UPGRADE_URL as string | undefined) ?? '').trim();

/**
 * Checkout URL for a specific signed-in user. The user's id rides along as
 * Stripe's `client_reference_id`, so the payment webhook knows exactly
 * which account to unlock; their email is prefilled for convenience.
 */
export function checkoutUrl(userId: string, email: string): string {
  if (!UPGRADE_URL) return '';
  const sep = UPGRADE_URL.includes('?') ? '&' : '?';
  const params = new URLSearchParams({ client_reference_id: userId });
  if (email) params.set('prefilled_email', email);
  return `${UPGRADE_URL}${sep}${params.toString()}`;
}

export async function fetchMe(): Promise<Me | null> {
  const res = await fetch('/api/me', { headers: { accept: 'application/json' } });
  if (!res.ok) return null;
  const data = await res.json();
  if (!data || typeof data.userId !== 'string') return null;
  return {
    userId: data.userId,
    userDetails: String(data.userDetails ?? ''),
    pro: data.pro === true,
    panel: data.panel === true,
    admin: data.admin === true,
  };
}

/** Payment Link for the Panel subscription, baked in at build time. */
export const PANEL_URL: string =
  ((import.meta.env.VITE_PANEL_URL as string | undefined) ?? '').trim();

/** Panel checkout for a specific signed-in user (same shape as Pro's). */
export function panelCheckoutUrl(userId: string, email: string): string {
  if (!PANEL_URL) return '';
  const sep = PANEL_URL.includes('?') ? '&' : '?';
  const params = new URLSearchParams({ client_reference_id: userId });
  if (email) params.set('prefilled_email', email);
  return `${PANEL_URL}${sep}${params.toString()}`;
}

/** Ask the account API for a short-lived installer download link. */
export async function panelDownloadUrl(key: 'mac-arm64' | 'mac-x64' | 'win-x64'): Promise<string> {
  const res = await fetch(`/api/me?panelDownload=${key}`, {
    headers: { accept: 'application/json' },
  });
  const data = await res.json().catch(() => null);
  if (!res.ok || typeof data?.url !== 'string') {
    throw new Error(data?.error ?? `Could not get the download (${res.status})`);
  }
  return data.url;
}

export async function loadAdminOverview(): Promise<AdminOverview> {
  const res = await fetch('/api/assist?scope=admin', { headers: { accept: 'application/json' } });
  if (!res.ok) throw new Error(`Failed to load admin data (${res.status})`);
  const data = await res.json();
  return {
    requests: Array.isArray(data?.requests) ? data.requests : [],
    stats: data?.stats && typeof data.stats === 'object' ? data.stats : null,
  };
}

export async function answerAssistRequest(id: string, answer: string): Promise<void> {
  const res = await fetch('/api/assist?scope=admin', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ id, answer }),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => null);
    throw new Error(data?.error ?? `Failed to save answer (${res.status})`);
  }
}

export async function listAssistRequests(): Promise<AssistRequest[]> {
  const res = await fetch('/api/assist', { headers: { accept: 'application/json' } });
  if (!res.ok) throw new Error(`Failed to load requests (${res.status})`);
  const data = await res.json();
  return Array.isArray(data?.requests) ? data.requests : [];
}

export async function submitAssistRequest(subject: string, message: string): Promise<AssistRequest> {
  const res = await fetch('/api/assist', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ subject, message }),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => null);
    throw new Error(data?.error ?? `Failed to submit (${res.status})`);
  }
  const data = await res.json();
  return data.request;
}
