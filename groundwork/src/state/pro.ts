// Groundwork Pro: entitlement lookup and advisor requests.

export interface Me {
  userId: string;
  userDetails: string;
  pro: boolean;
}

export interface AssistRequest {
  id: string;
  subject: string;
  message: string;
  status: string;
  createdAt: string;
}

/**
 * Optional checkout link (e.g. a Stripe Payment Link), baked in at build
 * time. When unset, the upgrade pitch shows an early-access note instead
 * of a buy button.
 */
export const UPGRADE_URL: string =
  ((import.meta.env.VITE_UPGRADE_URL as string | undefined) ?? '').trim();

export async function fetchMe(): Promise<Me | null> {
  const res = await fetch('/api/me', { headers: { accept: 'application/json' } });
  if (!res.ok) return null;
  const data = await res.json();
  if (!data || typeof data.userId !== 'string') return null;
  return {
    userId: data.userId,
    userDetails: String(data.userDetails ?? ''),
    pro: data.pro === true,
  };
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
