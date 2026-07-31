import type { VendorDef } from './types';

/**
 * The vendor catalog. Each entry describes how a console appears on the
 * board and what the setup form asks for. Connectors live in /connectors;
 * entries with ready:false render on the picker as planned so people can
 * see where the panel is going.
 */
export const VENDORS: VendorDef[] = [
  {
    id: 'github',
    name: 'GitHub',
    blurb: 'Secret scanning, code scanning and Dependabot alerts.',
    consoleUrl: 'https://github.com',
    fields: [
      { key: 'org', label: 'Organization or user', placeholder: 'your-org' },
      { key: 'token', label: 'Personal access token', secret: true, placeholder: 'github_pat_…' },
    ],
    accent: 'grape',
    ready: true,
  },
  {
    id: 'defender',
    name: 'Microsoft Defender',
    blurb: 'MDE and Microsoft 365 alerts through the Graph security API.',
    consoleUrl: 'https://security.microsoft.com',
    fields: [
      { key: 'tenantId', label: 'Tenant ID' },
      { key: 'clientId', label: 'App (client) ID' },
      { key: 'clientSecret', label: 'Client secret', secret: true },
    ],
    accent: 'blueberry',
    ready: false,
  },
  {
    id: 'crowdstrike',
    name: 'CrowdStrike Falcon',
    blurb: 'New alerts from the Falcon platform, split by severity.',
    consoleUrl: 'https://falcon.crowdstrike.com',
    fields: [
      { key: 'clientId', label: 'API client ID' },
      { key: 'clientSecret', label: 'API client secret', secret: true },
      {
        key: 'baseUrl',
        label: 'API base URL (your Falcon cloud)',
        placeholder: 'https://api.crowdstrike.com',
        optional: true,
      },
    ],
    accent: 'strawberry',
    ready: true,
  },
  {
    id: 'sentinelone',
    name: 'SentinelOne',
    blurb: 'Threats and incidents from the management console.',
    consoleUrl: 'https://usea1.sentinelone.net',
    fields: [
      { key: 'baseUrl', label: 'Console URL', placeholder: 'https://yourtenant.sentinelone.net' },
      { key: 'apiToken', label: 'API token', secret: true },
    ],
    accent: 'tangerine',
    ready: false,
  },
  {
    id: 'proofpoint',
    name: 'Proofpoint TAP',
    blurb: 'Blocked and delivered threats from the TAP dashboard.',
    consoleUrl: 'https://threatinsight.proofpoint.com',
    fields: [
      { key: 'principal', label: 'Service principal' },
      { key: 'secret', label: 'Secret', secret: true },
    ],
    accent: 'blueberry',
    ready: false,
  },
  {
    id: 'gworkspace',
    name: 'Google Workspace',
    blurb: 'Alert center: phishing, account and admin alerts.',
    consoleUrl: 'https://admin.google.com/ac/ac',
    fields: [
      { key: 'serviceAccountJson', label: 'Service account JSON', secret: true },
      { key: 'delegatedAdmin', label: 'Delegated admin email' },
    ],
    accent: 'lime',
    ready: false,
  },
];

export function vendorDef(id: string): VendorDef | undefined {
  return VENDORS.find((v) => v.id === id);
}
