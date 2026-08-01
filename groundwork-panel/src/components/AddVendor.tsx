import { useState } from 'react';
import { VENDORS } from '../vendors';
import type { VendorDef } from '../types';

interface Props {
  configured: string[];
  onSave: (id: string, creds: Record<string, string>, consoleUrl: string) => Promise<void>;
  onRemove: (id: string) => Promise<void>;
  onBack: () => void;
}

export function AddVendor({ configured, onSave, onRemove, onBack }: Props) {
  const [picked, setPicked] = useState<VendorDef | null>(null);
  const [creds, setCreds] = useState<Record<string, string>>({});
  const [consoleUrl, setConsoleUrl] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  if (!picked) {
    return (
      <div className="setup">
        <button className="btn" onClick={onBack}>
          ← Back to the board
        </button>
        <h2>Add a console</h2>
        <p className="setup-note">
          Keys are stored in a config file on this machine and are only ever sent to the vendor's
          own API. Groundwork servers never see them.
        </p>
        <div className="picker">
          {VENDORS.map((v) => (
            <button
              key={v.id}
              className={`picker-card tile-${v.accent}`}
              disabled={!v.ready}
              onClick={() => {
                setPicked(v);
                setConsoleUrl(v.consoleUrl);
              }}
            >
              <strong>{v.name}</strong>
              <span>{v.blurb}</span>
              {!v.ready && <em>Planned</em>}
              {v.ready && configured.includes(v.id) && <em>Added · open to update or remove</em>}
            </button>
          ))}
        </div>
      </div>
    );
  }

  const missing = picked.fields.some((f) => !f.optional && !(creds[f.key] ?? '').trim());
  const isUpdate = configured.includes(picked.id);

  return (
    <div className="setup">
      <button className="btn" onClick={() => setPicked(null)}>
        ← Choose a different console
      </button>
      <h2>{isUpdate ? `Update ${picked.name}` : `Connect ${picked.name}`}</h2>
      {isUpdate && (
        <p className="setup-note">
          Saved keys are never shown back, so enter the full credentials again to replace them.
          Saving runs a fresh connection check; nothing changes until it passes.
        </p>
      )}
      {picked.fields.map((f) => (
        <label key={f.key} className="field">
          <span className="field-label">{f.label}</span>
          <input
            type={f.secret ? 'password' : 'text'}
            placeholder={f.placeholder ?? ''}
            value={creds[f.key] ?? ''}
            onChange={(e) => setCreds({ ...creds, [f.key]: e.target.value })}
          />
        </label>
      ))}
      <label className="field">
        <span className="field-label">Console link for the tile</span>
        <input type="text" value={consoleUrl} onChange={(e) => setConsoleUrl(e.target.value)} />
      </label>
      {error && <p className="setup-error">{error}</p>}
      <button
        className="btn btn-primary"
        disabled={busy || missing}
        onClick={async () => {
          setBusy(true);
          setError('');
          try {
            await onSave(picked.id, creds, consoleUrl);
          } catch (e) {
            setError(e instanceof Error ? e.message : 'Could not save');
            setBusy(false);
          }
        }}
      >
        {busy ? 'Checking the connection…' : 'Save and check'}
      </button>
      {isUpdate && (
        <button
          className="btn btn-danger"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            setError('');
            try {
              await onRemove(picked.id);
            } catch (e) {
              setError(e instanceof Error ? e.message : 'Could not remove');
              setBusy(false);
            }
          }}
        >
          Remove this console
        </button>
      )}
    </div>
  );
}
