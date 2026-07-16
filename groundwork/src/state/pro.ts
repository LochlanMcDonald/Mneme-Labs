// Groundwork Pro: entitlement lookup and advisor requests.

export interface Me {
  userId: string;
  userDetails: string;
  pro: boolean;
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
    admin: data.admin === true,
  };
}

export async function listAllAssistRequests(): Promise<AdminAssistRequest[]> {
  const res = await fetch('/api/assist?scope=admin', { headers: { accept: 'application/json' } });
  if (!res.ok) throw new Error(`Failed to load requests (${res.status})`);
  const data = await res.json();
  return Array.isArray(data?.requests) ? data.requests : [];
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
