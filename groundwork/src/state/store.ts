import { useCallback, useEffect, useMemo, useState } from 'react';
import { buildPlan, initialItemStates } from '../engine/plan';
import type { AppState, CompanyProfile, ItemState, ItemStatus, Plan } from '../types';

const STORAGE_KEY = 'groundwork-state-v1';

const EMPTY_STATE: AppState = { profile: null, items: {}, generatedAt: null };

function loadState(): AppState {
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
  generate: (profile: CompanyProfile) => void;
  setStatus: (controlId: string, status: ItemStatus) => void;
  setNote: (controlId: string, note: string) => void;
  reset: () => void;
}

/**
 * App state with localStorage persistence. The plan itself is derived from
 * the profile on every load (so knowledge-base improvements reach existing
 * users); only the profile and per-item progress are persisted.
 */
export function useStore(): Store {
  const [state, setState] = useState<AppState>(loadState);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch {
      // Storage may be unavailable (private mode); the app still works in-memory.
    }
  }, [state]);

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
    generate,
    setStatus,
    setNote,
    reset,
  };
}
