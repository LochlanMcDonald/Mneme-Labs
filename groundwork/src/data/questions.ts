import type {
  ComplianceTarget,
  CustomerType,
  DataType,
  DeviceModel,
  ExistingMeasure,
  Infra,
  ProductType,
  Stage,
  TeamSize,
  WorkModel,
  CodeHosting,
} from '../types';

export interface Option<T extends string> {
  value: T;
  label: string;
  hint?: string;
}

export const TEAM_SIZE_OPTIONS: Option<TeamSize>[] = [
  { value: 'solo', label: 'Just me' },
  { value: 'small', label: '2–10 people' },
  { value: 'medium', label: '11–50 people' },
  { value: 'large', label: '51+ people' },
];

export const STAGE_OPTIONS: Option<Stage>[] = [
  { value: 'idea', label: 'Idea / pre-product', hint: 'Nothing live yet' },
  { value: 'building', label: 'Building', hint: 'Prototype or private beta' },
  { value: 'launched', label: 'Launched', hint: 'Real users or customers' },
  { value: 'scaling', label: 'Scaling', hint: 'Growing team and revenue' },
];

export const PRODUCT_TYPE_OPTIONS: Option<ProductType>[] = [
  { value: 'saas', label: 'Web app / SaaS' },
  { value: 'mobile', label: 'Mobile app' },
  { value: 'api', label: 'API / developer tool' },
  { value: 'ecommerce', label: 'E-commerce store' },
  { value: 'marketplace', label: 'Marketplace platform' },
  { value: 'hardware', label: 'Hardware / IoT device' },
  { value: 'agency', label: 'Services / agency / consultancy' },
  { value: 'internal', label: 'Internal tools only', hint: 'Nothing customer-facing yet' },
];

export const DATA_TYPE_OPTIONS: Option<DataType>[] = [
  { value: 'pii', label: 'Personal data (names, emails, addresses)' },
  { value: 'payments', label: 'Payment / card data' },
  { value: 'health', label: 'Health or medical data' },
  { value: 'financial', label: 'Financial records or bank data' },
  { value: 'credentials', label: 'Credentials / API keys for other services' },
  { value: 'children', label: 'Data about children under 13' },
  { value: 'ip', label: 'Sensitive IP / trade secrets' },
  { value: 'minimal', label: 'Very little — mostly anonymous or public data' },
];

export const INFRA_OPTIONS: Option<Infra>[] = [
  { value: 'aws', label: 'AWS' },
  { value: 'gcp', label: 'Google Cloud' },
  { value: 'azure', label: 'Azure' },
  { value: 'paas', label: 'Managed platform', hint: 'Vercel, Netlify, Heroku, Fly.io…' },
  { value: 'onprem', label: 'Own servers / on-prem' },
  { value: 'none', label: 'No infrastructure', hint: 'SaaS tools only' },
];

export const CODE_HOSTING_OPTIONS: Option<CodeHosting>[] = [
  { value: 'github', label: 'GitHub' },
  { value: 'gitlab', label: 'GitLab' },
  { value: 'bitbucket', label: 'Bitbucket' },
  { value: 'other', label: 'Somewhere else' },
  { value: 'none', label: 'No codebase', hint: 'No-code or non-technical business' },
];

export const CUSTOMER_OPTIONS: Option<CustomerType>[] = [
  { value: 'b2b', label: 'Businesses (B2B)' },
  { value: 'b2c', label: 'Consumers (B2C)' },
  { value: 'enterprise', label: 'Large enterprises', hint: 'Security questionnaires incoming' },
  { value: 'government', label: 'Government / public sector' },
];

export const WORK_MODEL_OPTIONS: Option<WorkModel>[] = [
  { value: 'remote', label: 'Fully remote' },
  { value: 'hybrid', label: 'Hybrid' },
  { value: 'office', label: 'Office-based' },
];

export const DEVICE_MODEL_OPTIONS: Option<DeviceModel>[] = [
  { value: 'company', label: 'Company-provided devices' },
  { value: 'byod', label: 'Personal devices (BYOD)' },
  { value: 'mixed', label: 'A mix of both' },
];

export const COMPLIANCE_OPTIONS: Option<ComplianceTarget>[] = [
  { value: 'soc2', label: 'SOC 2', hint: 'Common ask from US B2B customers' },
  { value: 'iso27001', label: 'ISO 27001', hint: 'Common internationally' },
  { value: 'hipaa', label: 'HIPAA', hint: 'US health data' },
  { value: 'pci', label: 'PCI DSS', hint: 'Card payments' },
  { value: 'gdpr', label: 'GDPR', hint: 'EU users or customers' },
  { value: 'unsure', label: 'Not sure yet', hint: "We'll flag likely ones" },
  { value: 'none', label: 'None needed right now' },
];

export const EXISTING_OPTIONS: Option<ExistingMeasure>[] = [
  { value: 'password-manager', label: 'Team password manager' },
  { value: 'mfa', label: 'MFA on important accounts' },
  { value: 'disk-encryption', label: 'Disk encryption on all devices' },
  { value: 'backups', label: 'Automated, tested backups' },
  { value: 'sso', label: 'Single sign-on (SSO)' },
  { value: 'mdm', label: 'Device management (MDM)' },
  { value: 'security-training', label: 'Security / phishing training' },
  { value: 'incident-plan', label: 'Written incident response plan' },
  { value: 'pentest', label: 'Penetration test in the last year' },
  { value: 'dependency-scanning', label: 'Automated dependency scanning' },
];
