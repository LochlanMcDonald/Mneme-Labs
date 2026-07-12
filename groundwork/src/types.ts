// Core domain types shared across the wizard, engine, and dashboard.

export type TeamSize = 'solo' | 'small' | 'medium' | 'large';
export type Stage = 'idea' | 'building' | 'launched' | 'scaling';

export type ProductType =
  | 'saas'
  | 'mobile'
  | 'api'
  | 'ecommerce'
  | 'marketplace'
  | 'hardware'
  | 'agency'
  | 'internal';

export type DataType =
  | 'pii'
  | 'payments'
  | 'health'
  | 'financial'
  | 'credentials'
  | 'children'
  | 'ip'
  | 'minimal';

export type Infra =
  | 'aws'
  | 'gcp'
  | 'azure'
  | 'paas'
  | 'onprem'
  | 'none';

export type CodeHosting = 'github' | 'gitlab' | 'bitbucket' | 'other' | 'none';
export type CustomerType = 'b2b' | 'b2c' | 'enterprise' | 'government';
export type WorkModel = 'remote' | 'office' | 'hybrid';
export type DeviceModel = 'company' | 'byod' | 'mixed';

export type ComplianceTarget =
  | 'soc2'
  | 'iso27001'
  | 'hipaa'
  | 'pci'
  | 'gdpr'
  | 'none'
  | 'unsure';

/** Measures the company reports already having in place. */
export type ExistingMeasure =
  | 'password-manager'
  | 'mfa'
  | 'disk-encryption'
  | 'backups'
  | 'sso'
  | 'mdm'
  | 'security-training'
  | 'incident-plan'
  | 'pentest'
  | 'dependency-scanning';

export interface CompanyProfile {
  companyName: string;
  description: string;
  teamSize: TeamSize;
  stage: Stage;
  productTypes: ProductType[];
  dataTypes: DataType[];
  infra: Infra[];
  codeHosting: CodeHosting;
  customers: CustomerType[];
  workModel: WorkModel;
  deviceModel: DeviceModel;
  complianceTargets: ComplianceTarget[];
  existing: ExistingMeasure[];
}

export type Category =
  | 'identity'
  | 'devices'
  | 'data'
  | 'cloud'
  | 'appsec'
  | 'vendors'
  | 'people'
  | 'incident'
  | 'compliance';

export const CATEGORY_LABELS: Record<Category, string> = {
  identity: 'Identity & Access',
  devices: 'Devices & Endpoints',
  data: 'Data Protection',
  cloud: 'Cloud & Infrastructure',
  appsec: 'Application Security',
  vendors: 'SaaS & Vendors',
  people: 'People & Culture',
  incident: 'Incident Readiness',
  compliance: 'Policies & Compliance',
};

/** Roadmap phases, in order of urgency. */
export type Phase = 'now' | 'thirty' | 'ninety' | 'ongoing';

export const PHASE_LABELS: Record<Phase, string> = {
  now: 'Do this week',
  thirty: 'First 30 days',
  ninety: 'First 90 days',
  ongoing: 'Ongoing habits',
};

export const PHASE_ORDER: Phase[] = ['now', 'thirty', 'ninety', 'ongoing'];

export type Effort = 'minutes' | 'hours' | 'days';
export type Cost = 'free' | 'low' | 'medium' | 'high';

export const EFFORT_LABELS: Record<Effort, string> = {
  minutes: 'Under an hour',
  hours: 'A few hours',
  days: 'Days of work',
};

export const COST_LABELS: Record<Cost, string> = {
  free: 'Free',
  low: '$',
  medium: '$$',
  high: '$$$',
};

export interface Control {
  id: string;
  title: string;
  category: Category;
  /** Plain-language explanation of the risk this addresses. */
  why: string;
  /** Concrete implementation steps. */
  how: string[];
  /** Suggested tools or services, if any. */
  tools?: string[];
  effort: Effort;
  cost: Cost;
  /** Default roadmap phase; the engine may promote it based on the profile. */
  phase: Phase;
  /** Baseline controls apply to every company regardless of profile. */
  baseline?: boolean;
  /**
   * Returns a human-readable reason this control applies to the given
   * profile, or null when it does not apply. Baseline controls may omit it.
   */
  when?: (profile: CompanyProfile) => string | null;
  /**
   * Optional promotion rule: returns an earlier phase when the profile makes
   * this control more urgent than its default phase.
   */
  promote?: (profile: CompanyProfile) => Phase | null;
  /** Framework tags for teams heading toward an audit. */
  frameworks?: string[];
  /** ExistingMeasure that, when reported, pre-marks this control done. */
  satisfiedBy?: ExistingMeasure;
}

export type ItemStatus = 'todo' | 'in-progress' | 'done' | 'na';

export interface PlanItem {
  control: Control;
  phase: Phase;
  /** Why this made it into the plan (profile-specific reasons). */
  reasons: string[];
}

export interface Plan {
  items: PlanItem[];
  generatedAt: string;
}

export interface ItemState {
  status: ItemStatus;
  note: string;
}

export interface AppState {
  profile: CompanyProfile | null;
  /** Keyed by control id. */
  items: Record<string, ItemState>;
  generatedAt: string | null;
}
