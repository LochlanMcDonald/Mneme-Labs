import { useEffect, useState } from 'react';
import type { Store } from '../state/store';
import { listAssistRequests, submitAssistRequest, type AssistRequest } from '../state/pro';
import { Upgrade } from './Upgrade';

interface Props {
  store: Store;
  onBack: () => void;
}

export function Advisor({ store, onBack }: Props) {
  const { me } = store;
  const [subject, setSubject] = useState('');
  const [message, setMessage] = useState('');
  const [requests, setRequests] = useState<AssistRequest[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [sent, setSent] = useState(false);

  const pro = me?.pro === true;

  useEffect(() => {
    if (!pro) return;
    let cancelled = false;
    listAssistRequests()
      .then((reqs) => {
        if (!cancelled) setRequests(reqs);
      })
      .catch(() => {
        if (!cancelled) setRequests([]);
      });
    return () => {
      cancelled = true;
    };
  }, [pro]);

  if (!pro) {
    return (
      <div className="pro-view">
        <button className="btn" onClick={onBack}>
          ← Back
        </button>
        <Upgrade auth={store.auth} />
      </div>
    );
  }

  const submit = async () => {
    setError('');
    setBusy(true);
    try {
      const created = await submitAssistRequest(subject, message);
      setRequests((prev) => [created, ...(prev ?? [])]);
      setSubject('');
      setMessage('');
      setSent(true);
      setTimeout(() => setSent(false), 4000);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="pro-view">
      <button className="btn" onClick={onBack}>
        ← Back
      </button>

      <section className="help-section">
        <h2>
          Ask a security advisor <span className="pro-badge">PRO</span>
        </h2>
        <p className="help-sub">
          A question, a decision to sanity-check, or something that just
          happened: send it over. A human replies to{' '}
          <strong>{me?.userDetails || 'your sign-in email'}</strong> within one
          business day, with your plan already in front of them. If it's
          urgent, say so in the subject.
        </p>

        <div className="advisor-form">
          <label className="field">
            <span className="field-label">Subject</span>
            <input
              type="text"
              value={subject}
              maxLength={200}
              placeholder="e.g. “URGENT: leaked AWS key” or “Is this vendor OK to use?”"
              onChange={(e) => setSubject(e.target.value)}
            />
          </label>
          <label className="field">
            <span className="field-label">What's going on?</span>
            <textarea
              rows={5}
              value={message}
              maxLength={4000}
              placeholder="The more context the better: what happened, what you've tried, links…"
              onChange={(e) => setMessage(e.target.value)}
            />
          </label>
          {error && <p className="advisor-error">{error}</p>}
          <button
            className="btn btn-primary"
            disabled={busy || !subject.trim() || !message.trim()}
            onClick={submit}
          >
            {busy ? 'Sending…' : sent ? 'Sent!' : 'Send to an advisor'}
          </button>
        </div>
      </section>

      <section className="help-section">
        <h2>Your requests</h2>
        {requests === null ? (
          <p className="help-sub">Loading…</p>
        ) : requests.length === 0 ? (
          <p className="help-sub">Nothing yet. Your requests will show up here.</p>
        ) : (
          requests.map((req) => (
            <div key={req.id} className="item-card">
              <div className="item-head advisor-request">
                <span className={`report-status report-status-${req.status === 'open' ? 'in-progress' : 'done'}`}>
                  {req.status === 'open' ? 'Received' : 'Answered'}
                </span>
                <div className="advisor-request-body">
                  <strong>{req.subject}</strong>
                  <span className="advisor-request-date">
                    {String(req.createdAt).slice(0, 10)}
                  </span>
                </div>
              </div>
            </div>
          ))
        )}
      </section>
    </div>
  );
}
