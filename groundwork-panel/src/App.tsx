import { useCallback, useEffect, useMemo, useState } from 'react';
import { BrandMark } from './components/BrandMark';
import { VendorTile } from './components/VendorTile';
import { AddVendor } from './components/AddVendor';
import { DEMO_RESULTS, DEMO_SEEN } from './demo';
import { vendorDef, VENDORS } from './vendors';
import type { PollResult, VendorConfig } from './types';

const POLL_MS = 5 * 60 * 1000;

type View = 'board' | 'add';

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`/panel-api/${path}`, init);
  if (!res.ok) {
    const data = await res.json().catch(() => null);
    throw new Error(data?.error ?? `Request failed (${res.status})`);
  }
  return res.json();
}

export function App() {
  // null = still finding out whether a local runtime is answering.
  const [configs, setConfigs] = useState<VendorConfig[] | null>(null);
  const [runtime, setRuntime] = useState(true);
  const [results, setResults] = useState<Record<string, PollResult>>({});
  const [seen, setSeen] = useState<Record<string, number>>({});
  const [view, setView] = useState<View>('board');
  const [checkedAt, setCheckedAt] = useState<Date | null>(null);

  useEffect(() => {
    api<{ vendors: VendorConfig[] }>('config')
      .then((d) => {
        setConfigs(d.vendors);
        setSeen(Object.fromEntries(d.vendors.map((v) => [v.id, v.seenTotal ?? 0])));
      })
      .catch(() => {
        // No local runtime (plain static preview): fall back to demo only.
        setRuntime(false);
        setConfigs([]);
      });
  }, []);

  const demo = configs !== null && configs.length === 0;

  const poll = useCallback(async () => {
    if (configs === null) return;
    if (demo) {
      setResults(Object.fromEntries(DEMO_RESULTS.map((r) => [r.id, r])));
      setCheckedAt(new Date());
      return;
    }
    for (const c of configs) {
      try {
        const r = await api<PollResult>('poll', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ id: c.id }),
        });
        setResults((prev) => ({ ...prev, [c.id]: r }));
      } catch (e) {
        setResults((prev) => ({
          ...prev,
          [c.id]: {
            id: c.id,
            ok: false,
            total: 0,
            severities: { critical: 0, high: 0, medium: 0, low: 0 },
            checkedAt: new Date().toISOString(),
            error: e instanceof Error ? e.message : 'Poll failed',
          },
        }));
      }
    }
    setCheckedAt(new Date());
  }, [configs, demo]);

  useEffect(() => {
    poll();
    const t = setInterval(poll, POLL_MS);
    return () => clearInterval(t);
  }, [poll]);

  const board = demo
    ? DEMO_RESULTS.map((r) => ({ id: r.id, consoleUrl: undefined as string | undefined }))
    : (configs ?? []);
  const seenFor = (id: string) => (demo ? (DEMO_SEEN[id] ?? 0) : (seen[id] ?? 0));

  const totals = useMemo(() => {
    let fresh = 0;
    let critical = 0;
    let down = 0;
    for (const b of board) {
      const r = results[b.id];
      if (!r) continue;
      if (!r.ok) {
        down += 1;
        continue;
      }
      fresh += Math.max(0, r.total - seenFor(b.id));
      critical += r.severities.critical;
    }
    return { fresh, critical, down };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [board, results, seen, demo]);

  const markReviewed = async (id: string) => {
    const total = results[id]?.total ?? 0;
    if (demo) return;
    setSeen((prev) => ({ ...prev, [id]: total }));
    await api('seen', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ id, seenTotal: total }),
    }).catch(() => {});
  };

  const saveVendor = async (id: string, creds: Record<string, string>, consoleUrl: string) => {
    const d = await api<{ vendors: VendorConfig[]; check: PollResult }>('config', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ id, creds, consoleUrl }),
    });
    setConfigs(d.vendors);
    setResults((prev) => ({ ...prev, [id]: d.check }));
    setView('board');
  };

  const removeVendor = async (id: string) => {
    const d = await api<{ vendors: VendorConfig[] }>('config', {
      method: 'DELETE',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ id }),
    });
    setConfigs(d.vendors);
    setResults((prev) => {
      const next = { ...prev };
      delete next[id];
      return next;
    });
    setView('board');
  };

  if (view === 'add') {
    return (
      <div className="panel">
        <AddVendor
          configured={(configs ?? []).map((c) => c.id)}
          onSave={saveVendor}
          onRemove={removeVendor}
          onBack={() => setView('board')}
        />
      </div>
    );
  }

  return (
    <div className="panel">
      <header className="panel-head">
        <div className="brand">
          <BrandMark className="brand-mark" />
          <span>
            Groundwork <em>Panel</em>
          </span>
        </div>
        <div className="head-right">
          {demo && <span className="demo-badge">Demo data</span>}
          <button className="btn" onClick={poll}>
            Refresh
          </button>
          <button className="btn btn-primary" onClick={() => setView('add')} disabled={!runtime}>
            Add a console
          </button>
        </div>
      </header>

      <div className="summary">
        <div className="sum-stat">
          <strong>{totals.fresh}</strong>
          <span>new alerts across {board.length} consoles</span>
        </div>
        <div className={`sum-stat ${totals.critical > 0 ? 'sum-bad' : ''}`}>
          <strong>{totals.critical}</strong>
          <span>critical open</span>
        </div>
        <div className={`sum-stat ${totals.down > 0 ? 'sum-bad' : ''}`}>
          <strong>{board.length - totals.down}/{board.length}</strong>
          <span>APIs reachable</span>
        </div>
        <span className="sum-when">
          {checkedAt
            ? `Checked ${checkedAt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`
            : 'Checking…'}
        </span>
      </div>

      <main className="tiles">
        {board.map((b) => {
          const def = vendorDef(b.id) ?? VENDORS[0];
          return (
            <VendorTile
              key={b.id}
              def={def}
              result={results[b.id] ?? null}
              consoleUrl={b.consoleUrl || def.consoleUrl}
              seenTotal={seenFor(b.id)}
              onReviewed={() => markReviewed(b.id)}
            />
          );
        })}
      </main>

      {demo && runtime && (
        <p className="demo-note">
          This board is showing demo data. Add your first console and it goes live; your keys stay
          in a config file on this machine.
        </p>
      )}

      <footer className="panel-foot">
        Every console, one glance. Part of{' '}
        <a href="https://groundwork-security.com" target="_blank" rel="noreferrer">
          Groundwork
        </a>
        .
      </footer>
    </div>
  );
}
