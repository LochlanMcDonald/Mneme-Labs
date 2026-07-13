import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { buildPlan, initialItemStates } from '../engine/plan';
import { fetchAuth, type AuthState } from './auth';
import {
  loadServerState,
  resolveInitialState,
  saveServerState,
  type SyncStatus,
} from './sync';
import type { AppState, CompanyProfile, ItemState, ItemStatus, Plan } from '../types';

const STORAGE_KEY = 'groundwork-state-v1';
const SAVE_DEBOUNCE_MS = 1200;

const EMPTY_STATE: AppState = { profile: null, items: {}, generatedAt: null };

function loadLocalState(): AppState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return EMPTY_STATE;
    const parsed = JSON.parse(raw) as AppState;
    if (!parsed || typeof parsed !== 'object') return EMPTY_STATE;
    return { ...EMPTY_STATE, ...parsed };
  } catch {
    return EMPTY_STATE;
  }
}

export interface Store {
  profile: CompanyProfile | null;
  plan: Plan | null;
  items: Record<string, ItemState>;
  generatedAt: string | null;
  auth: AuthState;
  sync: SyncStatus;
  generate: (profile: CompanyProfile) => void;
  setStatus: (controlId: string, status: ItemStatus) => void;
  setNote: (controlId: string, note: string) => void;
  reset: () => void;
}

/**
 * App state, persisted locally in localStorage and, for signed-in users on
 * Azure, synced to their account through /api/state. The plan itself is
 * derived from the profile on every load so knowledge-base improvements
 * reach existing users; only the profile and per-item progress persist.
 *
 * Sync model: on sign-in, a saved plan on the account replaces local state
 * (so a new device shows your plan); if the account is empty, the local
 * plan is pushed up. After that, changes save automatically, last write
 * wins.
 */
export function useStore(): Store {
  const [state, setState] = useState<AppState>(loadLocalState);
  const [auth, setAuth] = useState<AuthState>({ status: 'checking', user: null });
  const [sync, setSync] = useState<SyncStatus>('idle');

  // JSON of the last state confirmed on the server, to avoid echoing a
  // just-loaded server state back up. Null until the initial load ran.
  const lastSyncedRef = useRef<string | null>(null);
  const serverReadyRef = useRef(false);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch {
      // Storage may be unavailable (private mode); the app still works in-memory.
    }
  }, [state]);

  useEffect(() => {
    let cancelled = false;
    fetchAuth().then((a) => {
      if (!cancelled) setAuth(a);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  // Initial account load once signed in.
  useEffect(() => {
    if (auth.status !== 'signed-in') return;
    let cancelled = false;
    (async () => {
      try {
        const server = await loadServerState();
        if (cancelled) return;
        const local = loadLocalState();
        const resolution = resolveInitialState(local, server);
        if (resolution.action === 'use-server') {
          lastSyncedRef.current = JSON.stringify(resolution.state);
          setState(resolution.state);
          setSync('saved');
        } else if (resolution.action === 'push-local') {
          await saveServerState(local);
          if (cancelled) return;
          lastSyncedRef.current = JSON.stringify(local);
          setSync('saved');
        } else {
          lastSyncedRef.current = JSON.stringify(EMPTY_STATE);
        }
        serverReadyRef.current = true;
      } catch {
        if (!cancelled) setSync('error');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [auth.status]);

  // Debounced save of changes while signed in.
  useEffect(() => {
    if (auth.status !== 'signed-in' || !serverReadyRef.current) return;
    const json = JSON.stringify(state);
    if (json === lastSyncedRef.current) return;
    setSync('saving');
    const timer = setTimeout(async () => {
      try {
        await saveServerState(state);
        lastSyncedRef.current = json;
        setSync('saved');
      } catch {
        setSync('error');
      }
    }, SAVE_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [state, auth.status]);

  const plan = useMemo(
    () => (state.profile ? buildPlan(state.profile) : null),
    [state.profile],
  );

  const generate = useCallback((profile: CompanyProfile) => {
    const newPlan = buildPlan(profile);
    setState((prev) => {
      // Preserve progress on controls that survive a profile edit.
      const items = initialItemStates(profile, newPlan);
      for (const [id, existing] of Object.entries(prev.items)) {
        if (id in items && existing.status !== 'todo') items[id] = existing;
        else if (id in items && existing.note) items[id] = { ...items[id], note: existing.note };
      }
      return { profile, items, generatedAt: newPlan.generatedAt };
    });
  }, []);

  const setStatus = useCallback((controlId: string, status: ItemStatus) => {
    setState((prev) => {
      const existing: ItemState = prev.items[controlId] ?? { status: 'todo', note: '' };
      return {
        ...prev,
        items: { ...prev.items, [controlId]: { ...existing, status } },
      };
    });
  }, []);

  const setNote = useCallback((controlId: string, note: string) => {
    setState((prev) => {
      const existing: ItemState = prev.items[controlId] ?? { status: 'todo', note: '' };
      return {
        ...prev,
        items: { ...prev.items, [controlId]: { ...existing, note } },
      };
    });
  }, []);

  const reset = useCallback(() => {
    setState(EMPTY_STATE);
  }, []);

  return {
    profile: state.profile,
    plan,
    items: state.items,
    generatedAt: state.generatedAt,
    auth,
    sync,
    generate,
    setStatus,
    setNote,
    reset,
  };
}
