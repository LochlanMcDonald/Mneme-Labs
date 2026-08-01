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
    ready: true,
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
    id: 'sentinel',
    name: 'Microsoft Sentinel',
    blurb: 'Open incidents from your Sentinel workspace.',
    consoleUrl: 'https://portal.azure.com/#view/Microsoft_Azure_Security_Insights/MainMenuBlade',
    fields: [
      { key: 'tenantId', label: 'Tenant ID' },
      { key: 'clientId', label: 'App (client) ID' },
      { key: 'clientSecret', label: 'Client secret', secret: true },
      { key: 'subscriptionId', label: 'Subscription ID' },
      { key: 'resourceGroup', label: 'Resource group' },
      { key: 'workspace', label: 'Log Analytics workspace' },
    ],
    accent: 'tangerine',
    ready: true,
  },
  {
    id: 'proofpoint',
    name: 'Proofpoint TRAP',
    blurb: 'Open incidents from Threat Response Auto-Pull.',
    consoleUrl: 'https://your-trap-appliance',
    fields: [
      { key: 'baseUrl', label: 'Appliance URL', placeholder: 'https://trap.yourcompany.com' },
      { key: 'apiKey', label: 'API key', secret: true },
    ],
    accent: 'blueberry',
    ready: true,
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
    ready: true,
  },
];

export function vendorDef(id: string): VendorDef | undefined {
  return VENDORS.find((v) => v.id === id);
}
