import type { AppState } from '../types';

export type SyncStatus = 'idle' | 'saving' | 'saved' | 'error';

export type InitialResolution =
  | { action: 'use-server'; state: AppState }
  | { action: 'push-local' }
  | { action: 'reset' };

/**
 * Decide what to do when a signed-in user's saved state arrives.
 *
 * A saved plan on the account wins over whatever this browser holds, so
 * signing in on a new device shows your plan. If the account has nothing
 * saved yet, this browser's plan is adopted only when it belongs to this
 * user or was built logged-out (ownerId null) — never another user's
 * leftover plan on a shared browser. Otherwise the account starts empty.
 */
export function resolveInitialState(
  local: AppState,
  server: AppState | null,
  userId: string,
): InitialResolution {
  if (server && server.profile) {
    return { action: 'use-server', state: server };
  }
  const localOwner = local.ownerId ?? null;
  if (local.profile && (localOwner === null || localOwner === userId)) {
    return { action: 'push-local' };
  }
  return { action: 'reset' };
}

export async function loadServerState(): Promise<AppState | null> {
  const res = await fetch('/api/state', { headers: { accept: 'application/json' } });
  if (!res.ok) {
    throw new Error(`Failed to load saved plan (${res.status})`);
  }
  const data = await res.json();
  return data?.state ?? null;
}

export async function saveServerState(state: AppState): Promise<void> {
  const res = await fetch('/api/state', {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ state }),
  });
  if (!res.ok && res.status !== 204) {
    throw new Error(`Failed to save plan (${res.status})`);
  }
}
