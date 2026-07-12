import { useState } from 'react';
import type { CompanyProfile } from '../types';
import {
  CODE_HOSTING_OPTIONS,
  COMPLIANCE_OPTIONS,
  CUSTOMER_OPTIONS,
  DATA_TYPE_OPTIONS,
  DEVICE_MODEL_OPTIONS,
  EXISTING_OPTIONS,
  INFRA_OPTIONS,
  PRODUCT_TYPE_OPTIONS,
  STAGE_OPTIONS,
  TEAM_SIZE_OPTIONS,
  WORK_MODEL_OPTIONS,
  type Option,
} from '../data/questions';

interface Props {
  initial: CompanyProfile | null;
  onComplete: (profile: CompanyProfile) => void;
  onCancel: (() => void) | null;
}

const BLANK: CompanyProfile = {
  companyName: '',
  description: '',
  teamSize: 'small',
  stage: 'building',
  productTypes: [],
  dataTypes: [],
  infra: [],
  codeHosting: 'github',
  customers: [],
  workModel: 'remote',
  deviceModel: 'mixed',
  complianceTargets: [],
  existing: [],
};

/** Single-choice pill group. */
function Choice<T extends string>({
  options,
  value,
  onChange,
}: {
  options: Option<T>[];
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <div className="choice-grid" role="radiogroup">
      {options.map((opt) => (
        <button
          type="button"
          key={opt.value}
          role="radio"
          aria-checked={value === opt.value}
          className={`choice ${value === opt.value ? 'selected' : ''}`}
          onClick={() => onChange(opt.value)}
        >
          <span className="choice-label">{opt.label}</span>
          {opt.hint && <span className="choice-hint">{opt.hint}</span>}
        </button>
      ))}
    </div>
  );
}

/** Multi-choice pill group. */
function MultiChoice<T extends string>({
  options,
  values,
  onChange,
}: {
  options: Option<T>[];
  values: T[];
  onChange: (v: T[]) => void;
}) {
  const toggle = (v: T) =>
    onChange(values.includes(v) ? values.filter((x) => x !== v) : [...values, v]);
  return (
    <div className="choice-grid">
      {options.map((opt) => (
        <button
          type="button"
          key={opt.value}
          aria-pressed={values.includes(opt.value)}
          className={`choice ${values.includes(opt.value) ? 'selected' : ''}`}
          onClick={() => toggle(opt.value)}
        >
          <span className="choice-label">{opt.label}</span>
          {opt.hint && <span className="choice-hint">{opt.hint}</span>}
        </button>
      ))}
    </div>
  );
}

interface StepDef {
  title: string;
  subtitle: string;
  render: (p: CompanyProfile, set: (patch: Partial<CompanyProfile>) => void) => JSX.Element;
}

const STEPS: StepDef[] = [
  {
    title: 'About your company',
    subtitle: 'The basics — who you are and where you’re at.',
    render: (p, set) => (
      <>
        <label className="field">
          <span className="field-label">Company name</span>
          <input
            type="text"
            value={p.companyName}
            placeholder="Acme Inc."
            onChange={(e) => set({ companyName: e.target.value })}
          />
        </label>
        <label className="field">
          <span className="field-label">What does the company do?</span>
          <textarea
            value={p.description}
            rows={3}
            placeholder="One or two sentences — e.g. “We build scheduling software for veterinary clinics.”"
            onChange={(e) => set({ description: e.target.value })}
          />
        </label>
        <div className="field">
          <span className="field-label">How big is the team (including contractors)?</span>
          <Choice options={TEAM_SIZE_OPTIONS} value={p.teamSize} onChange={(v) => set({ teamSize: v })} />
        </div>
        <div className="field">
          <span className="field-label">What stage are you at?</span>
          <Choice options={STAGE_OPTIONS} value={p.stage} onChange={(v) => set({ stage: v })} />
        </div>
      </>
    ),
  },
  {
    title: 'Product & data',
    subtitle: 'What you build and the data flowing through it drive most of your risk.',
    render: (p, set) => (
      <>
        <div className="field">
          <span className="field-label">What are you building? (select all that apply)</span>
          <MultiChoice
            options={PRODUCT_TYPE_OPTIONS}
            values={p.productTypes}
            onChange={(v) => set({ productTypes: v })}
          />
        </div>
        <div className="field">
          <span className="field-label">What kinds of data do you handle? (select all that apply)</span>
          <MultiChoice
            options={DATA_TYPE_OPTIONS}
            values={p.dataTypes}
            onChange={(v) => set({ dataTypes: v })}
          />
        </div>
      </>
    ),
  },
  {
    title: 'Systems & infrastructure',
    subtitle: 'Where your product and code live determines which technical controls apply.',
    render: (p, set) => (
      <>
        <div className="field">
          <span className="field-label">Where does your product run? (select all that apply)</span>
          <MultiChoice options={INFRA_OPTIONS} values={p.infra} onChange={(v) => set({ infra: v })} />
        </div>
        <div className="field">
          <span className="field-label">Where does your code live?</span>
          <Choice
            options={CODE_HOSTING_OPTIONS}
            value={p.codeHosting}
            onChange={(v) => set({ codeHosting: v })}
          />
        </div>
      </>
    ),
  },
  {
    title: 'Team & ways of working',
    subtitle: 'How your team works shapes device and workplace controls.',
    render: (p, set) => (
      <>
        <div className="field">
          <span className="field-label">How does the team work?</span>
          <Choice options={WORK_MODEL_OPTIONS} value={p.workModel} onChange={(v) => set({ workModel: v })} />
        </div>
        <div className="field">
          <span className="field-label">What devices does the team use for work?</span>
          <Choice
            options={DEVICE_MODEL_OPTIONS}
            value={p.deviceModel}
            onChange={(v) => set({ deviceModel: v })}
          />
        </div>
      </>
    ),
  },
  {
    title: 'Customers & compliance',
    subtitle: 'Who you sell to determines which frameworks will be demanded of you.',
    render: (p, set) => (
      <>
        <div className="field">
          <span className="field-label">Who are your customers? (select all that apply)</span>
          <MultiChoice options={CUSTOMER_OPTIONS} values={p.customers} onChange={(v) => set({ customers: v })} />
        </div>
        <div className="field">
          <span className="field-label">
            Any compliance frameworks on your radar? (select all that apply)
          </span>
          <MultiChoice
            options={COMPLIANCE_OPTIONS}
            values={p.complianceTargets}
            onChange={(v) => set({ complianceTargets: v })}
          />
        </div>
      </>
    ),
  },
  {
    title: 'What you already have',
    subtitle: 'We’ll pre-mark these as done so your plan starts with credit for existing work.',
    render: (p, set) => (
      <div className="field">
        <span className="field-label">
          Which of these are already fully in place? (select all that apply — be honest, it’s your plan)
        </span>
        <MultiChoice options={EXISTING_OPTIONS} values={p.existing} onChange={(v) => set({ existing: v })} />
      </div>
    ),
  },
];

export function Wizard({ initial, onComplete, onCancel }: Props) {
  const [profile, setProfile] = useState<CompanyProfile>(initial ?? BLANK);
  const [step, setStep] = useState(0);

  const set = (patch: Partial<CompanyProfile>) => setProfile((prev) => ({ ...prev, ...patch }));
  const current = STEPS[step];
  const isLast = step === STEPS.length - 1;

  return (
    <div className="wizard">
      <div className="wizard-progress">
        {STEPS.map((s, i) => (
          <div
            key={s.title}
            className={`wizard-progress-seg ${i <= step ? 'active' : ''}`}
            title={s.title}
          />
        ))}
      </div>
      <p className="wizard-step-count">
        Step {step + 1} of {STEPS.length}
      </p>
      <h2>{current.title}</h2>
      <p className="wizard-subtitle">{current.subtitle}</p>

      <div className="wizard-body">{current.render(profile, set)}</div>

      <div className="wizard-nav">
        {step > 0 ? (
          <button className="btn" onClick={() => setStep(step - 1)}>
            Back
          </button>
        ) : onCancel ? (
          <button className="btn" onClick={onCancel}>
            Cancel
          </button>
        ) : (
          <span />
        )}
        {isLast ? (
          <button className="btn btn-primary" onClick={() => onComplete(profile)}>
            Generate my plan
          </button>
        ) : (
          <button className="btn btn-primary" onClick={() => setStep(step + 1)}>
            Continue
          </button>
        )}
      </div>
    </div>
  );
}
