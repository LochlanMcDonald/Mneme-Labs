import { useEffect, useState } from 'react';
import type { Store } from '../state/store';
import {
  answerAssistRequest,
  listAllAssistRequests,
  type AdminAssistRequest,
} from '../state/pro';

interface Props {
  store: Store;
  onBack: () => void;
}

function RequestCard({
  req,
  onAnswered,
}: {
  req: AdminAssistRequest;
  onAnswered: (id: string, answer: string) => void;
}) {
  const [draft, setDraft] = useState(req.answer ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const save = async () => {
    setError('');
    setBusy(true);
    try {
      await answerAssistRequest(req.id, draft);
      onAnswered(req.id, draft);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to save');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="item-card">
      <div className="item-detail" style={{ borderTop: 'none' }}>
        <div className="admin-req-head">
          <span className={`report-status report-status-${req.status === 'open' ? 'in-progress' : 'done'}`}>
            {req.status === 'open' ? 'Open' : 'Answered'}
          </span>
          <strong>{req.subject}</strong>
        </div>
        <p className="admin-req-meta">
          {req.userDetails || req.userId} · {String(req.createdAt).slice(0, 16).replace('T', ' ')}
        </p>
        <p className="item-why">{req.message}</p>
        <label className="field">
          <span className="field-label">Reply</span>
          <textarea rows={4} value={draft} onChange={(e) => setDraft(e.target.value)} />
        </label>
        {error && <p className="advisor-error">{error}</p>}
        <button className="btn btn-primary" disabled={busy || !draft.trim()} onClick={save}>
          {busy ? 'Saving…' : req.status === 'answered' ? 'Update reply' : 'Send reply'}
        </button>
      </div>
    </div>
  );
}

export function Admin({ store, onBack }: Props) {
  const [requests, setRequests] = useState<AdminAssistRequest[] | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    listAllAssistRequests()
      .then((r) => !cancelled && setRequests(r))
      .catch((e) => !cancelled && setError(e instanceof Error ? e.message : 'Failed to load'));
    return () => {
      cancelled = true;
    };
  }, []);

  if (!store.me?.admin) {
    return (
      <div className="pro-view">
        <button className="btn" onClick={onBack}>
          ← Back
        </button>
        <p className="help-sub">This area is for Groundwork admins.</p>
      </div>
    );
  }

  const onAnswered = (id: string, answer: string) =>
    setRequests(
      (prev) =>
        prev?.map((r) =>
          r.id === id ? { ...r, answer, status: 'answered', answeredAt: new Date().toISOString() } : r,
        ) ?? null,
    );

  const open = requests?.filter((r) => r.status === 'open') ?? [];
  const answered = requests?.filter((r) => r.status !== 'open') ?? [];

  return (
    <div className="pro-view">
      <button className="btn" onClick={onBack}>
        ← Back
      </button>
      <section className="help-section">
        <h2>Advisor requests</h2>
        {error && <p className="advisor-error">{error}</p>}
        {requests === null ? (
          <p className="help-sub">Loading…</p>
        ) : requests.length === 0 ? (
          <p className="help-sub">No requests yet.</p>
        ) : (
          <>
            <h3 className="admin-group">Open ({open.length})</h3>
            {open.length === 0 ? (
              <p className="help-sub">Nothing waiting. Nice.</p>
            ) : (
              open.map((req) => <RequestCard key={req.id} req={req} onAnswered={onAnswered} />)
            )}
            <h3 className="admin-group">Answered ({answered.length})</h3>
            {answered.map((req) => (
              <RequestCard key={req.id} req={req} onAnswered={onAnswered} />
            ))}
          </>
        )}
      </section>
    </div>
  );
}
