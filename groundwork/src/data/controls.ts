import type { CompanyProfile, Control } from '../types';

// Small helpers to keep the applicability rules readable.
const has = <T,>(list: T[], ...values: T[]) => values.some((v) => list.includes(v));
const notSolo = (p: CompanyProfile) => p.teamSize !== 'solo';
const hasCode = (p: CompanyProfile) => p.codeHosting !== 'none';
const hasCloud = (p: CompanyProfile) => has(p.infra, 'aws', 'gcp', 'azure');
const hasInfra = (p: CompanyProfile) => has(p.infra, 'aws', 'gcp', 'azure', 'paas', 'onprem');
const shipsProduct = (p: CompanyProfile) =>
  has(p.productTypes, 'saas', 'mobile', 'api', 'ecommerce', 'marketplace');
const sensitiveData = (p: CompanyProfile) =>
  has(p.dataTypes, 'pii', 'payments', 'health', 'financial', 'credentials', 'children');
const wantsAudit = (p: CompanyProfile) =>
  has(p.complianceTargets, 'soc2', 'iso27001', 'hipaa', 'pci');

/**
 * The Groundwork control knowledge base.
 *
 * Baseline controls apply to everyone. Non-baseline controls carry a `when`
 * rule that returns a profile-specific reason, and an optional `promote`
 * rule that pulls the control into an earlier phase when the stakes are
 * higher for this particular company.
 */
export const CONTROLS: Control[] = [
  // ──────────────────────────── Identity & Access ────────────────────────────
  {
    id: 'password-manager',
    title: 'Roll out a password manager to everyone',
    category: 'identity',
    why: 'Reused and weak passwords are the single most common way small companies get breached. A password manager makes strong, unique passwords the path of least resistance.',
    how: [
      'Pick a team password manager and create an organization account.',
      'Have every teammate install the app and browser extension.',
      'Import existing passwords, then rotate any that were reused across sites.',
      'Create shared vaults for team credentials (never share passwords over chat or email).',
    ],
    tools: ['1Password', 'Bitwarden', 'Dashlane'],
    effort: 'hours',
    cost: 'low',
    phase: 'now',
    baseline: true,
    satisfiedBy: 'password-manager',
    frameworks: ['SOC 2 CC6.1', 'CIS 5', 'ISO 27001 A.5.17'],
  },
  {
    id: 'mfa-everywhere',
    title: 'Turn on multi-factor authentication for every account',
    category: 'identity',
    why: 'MFA blocks the vast majority of account-takeover attacks, including ones where the password has already leaked.',
    how: [
      'Enable MFA on email first — it is the master key to everything else.',
      'Then cover your cloud provider, code hosting, password manager, banking, DNS registrar, and payment processors.',
      'Prefer app-based codes or hardware keys over SMS, which can be SIM-swapped.',
      'Store backup codes in the password manager.',
    ],
    tools: ['Built-in authenticators', 'YubiKey', 'Google Authenticator'],
    effort: 'hours',
    cost: 'free',
    phase: 'now',
    baseline: true,
    satisfiedBy: 'mfa',
    frameworks: ['SOC 2 CC6.1', 'CIS 6.3', 'ISO 27001 A.5.17'],
  },
  {
    id: 'admin-separation',
    title: 'Lock down and separate admin accounts',
    category: 'identity',
    why: 'When day-to-day accounts double as admin accounts, one phished teammate hands over the keys to everything.',
    how: [
      'Inventory who has admin/owner rights on each critical system (email, cloud, code hosting, DNS, billing).',
      'Reduce every account to the minimum role it needs — most people need "member", not "admin".',
      'Ensure at least two people (or a break-glass account with credentials in the vault) hold owner access so you are not locked out.',
      'Require hardware-key or app MFA on all remaining admin accounts.',
    ],
    effort: 'hours',
    cost: 'free',
    phase: 'now',
    baseline: true,
    frameworks: ['SOC 2 CC6.3', 'CIS 5.4', 'ISO 27001 A.8.2'],
  },
  {
    id: 'offboarding-checklist',
    title: 'Create an on/offboarding access checklist',
    category: 'identity',
    why: 'Ex-employees and forgotten contractor accounts are a classic breach vector. A checklist turns "did we remember?" into a five-minute routine.',
    how: [
      'List every system a new teammate gets access to (email, chat, code, cloud, SaaS tools).',
      'Write the mirror-image offboarding list: disable SSO/email first, then revoke each system, transfer file ownership, and collect devices.',
      'Store it where whoever handles the next departure will actually find it.',
      'Dry-run it on the next departure and fix what you missed.',
    ],
    effort: 'hours',
    cost: 'free',
    phase: 'thirty',
    when: (p) => (notSolo(p) ? 'You have teammates whose access needs managing when they join or leave.' : null),
    frameworks: ['SOC 2 CC6.2', 'CIS 5.3', 'ISO 27001 A.5.11'],
  },
  {
    id: 'sso',
    title: 'Adopt single sign-on for your core tools',
    category: 'identity',
    why: 'SSO centralizes login security: one strong identity with MFA, and one switch to flip when someone leaves.',
    how: [
      'Standardize on Google Workspace or Microsoft 365 as your identity provider.',
      'Turn on "Sign in with Google/Microsoft" in every SaaS tool that supports it.',
      'For tools without SSO support, note them in your vendor list — revoking access to those is a manual offboarding step.',
      'As you grow past ~20 people, consider a dedicated IdP (Okta, JumpCloud) and SCIM provisioning.',
    ],
    tools: ['Google Workspace', 'Microsoft Entra ID', 'Okta', 'JumpCloud'],
    effort: 'hours',
    cost: 'low',
    phase: 'ninety',
    satisfiedBy: 'sso',
    when: (p) =>
      p.teamSize === 'medium' || p.teamSize === 'large'
        ? 'At your team size, per-app passwords stop scaling — SSO keeps access manageable.'
        : notSolo(p)
          ? 'Even a small team benefits from centralizing logins behind one identity provider.'
          : null,
    promote: (p) => (p.teamSize === 'large' ? 'thirty' : null),
    frameworks: ['SOC 2 CC6.1', 'CIS 6.7', 'ISO 27001 A.5.16'],
  },
  {
    id: 'access-reviews',
    title: 'Run quarterly access reviews',
    category: 'identity',
    why: 'Access accumulates: people change roles, contractors finish, integrations linger. A quarterly review claws back permissions nobody needs anymore.',
    how: [
      'Every quarter, export the member list of each critical system.',
      'For each person and API token, ask: do they still need this, at this level?',
      'Remove or downgrade anything that fails the test, and log the review (a dated note is enough).',
      'Auditors love this: keep the notes if you are heading for SOC 2 or ISO 27001.',
    ],
    effort: 'hours',
    cost: 'free',
    phase: 'ongoing',
    when: (p) =>
      notSolo(p)
        ? 'With a team, permissions drift over time and need periodic pruning.'
        : wantsAudit(p)
          ? 'Access reviews are a core recurring control in the frameworks you are targeting.'
          : null,
    frameworks: ['SOC 2 CC6.2', 'CIS 5.1', 'ISO 27001 A.5.18'],
  },

  // ─────────────────────────── Devices & Endpoints ───────────────────────────
  {
    id: 'disk-encryption',
    title: 'Turn on full-disk encryption on every computer',
    category: 'devices',
    why: 'A lost or stolen laptop without disk encryption is a data breach; with it, it is just a hardware loss.',
    how: [
      'macOS: enable FileVault in System Settings → Privacy & Security.',
      'Windows: enable BitLocker (or Device Encryption on Home editions).',
      'Linux: use LUKS full-disk encryption at install time.',
      'Confirm every machine that touches company data is covered, including personal machines if you allow BYOD.',
    ],
    effort: 'minutes',
    cost: 'free',
    phase: 'now',
    baseline: true,
    satisfiedBy: 'disk-encryption',
    frameworks: ['SOC 2 CC6.7', 'CIS 3.6', 'ISO 27001 A.8.1'],
  },
  {
    id: 'auto-updates',
    title: 'Enable automatic OS and browser updates',
    category: 'devices',
    why: 'Most malware exploits vulnerabilities that were patched months earlier. Auto-updates close the window without anyone having to think about it.',
    how: [
      'Turn on automatic updates for the operating system on every device.',
      'Set browsers to update automatically and relaunch regularly.',
      'Delete software you no longer use — every installed app is attack surface.',
    ],
    effort: 'minutes',
    cost: 'free',
    phase: 'now',
    baseline: true,
    frameworks: ['SOC 2 CC7.1', 'CIS 7.3', 'ISO 27001 A.8.8'],
  },
  {
    id: 'screen-lock',
    title: 'Require screen locks and strong device passcodes',
    category: 'devices',
    why: 'An unlocked laptop in a café or coworking space is an open door to your email, code, and customer data.',
    how: [
      'Set screens to lock automatically after at most 5 minutes of inactivity.',
      'Require a password/biometric to wake every device, including phones that receive company email.',
      'Make it a norm: lock your screen whenever you step away.',
    ],
    effort: 'minutes',
    cost: 'free',
    phase: 'now',
    baseline: true,
    frameworks: ['SOC 2 CC6.7', 'CIS 4.3', 'ISO 27001 A.8.1'],
  },
  {
    id: 'find-my-device',
    title: 'Enable remote find/wipe on all devices',
    category: 'devices',
    why: 'When a device goes missing, remote lock and wipe is the difference between an inconvenience and an incident.',
    how: [
      'Enable Find My (Apple) or Find My Device (Android/Windows) on every company device.',
      'Verify each teammate can actually trigger a remote lock from another device.',
      'Add "remote-wipe the device" to your incident quick-reference for lost hardware.',
    ],
    effort: 'minutes',
    cost: 'free',
    phase: 'thirty',
    baseline: true,
    frameworks: ['CIS 4.11', 'ISO 27001 A.8.1'],
  },
  {
    id: 'mdm',
    title: 'Set up mobile device management (MDM)',
    category: 'devices',
    why: 'Past a handful of laptops, you cannot verify encryption, updates, and screen locks by asking nicely. MDM enforces your device baseline automatically.',
    how: [
      'Choose an MDM that fits your fleet (Apple-heavy startups often start with a Mac-focused tool).',
      'Enroll all company devices and enforce: disk encryption, screen lock, OS updates, and remote wipe.',
      'If you allow BYOD, use the MDM\'s work-profile mode rather than fully managing personal devices.',
    ],
    tools: ['Kandji', 'Jamf', 'Mosyle', 'Microsoft Intune'],
    effort: 'days',
    cost: 'medium',
    phase: 'ninety',
    satisfiedBy: 'mdm',
    when: (p) =>
      p.teamSize === 'medium' || p.teamSize === 'large'
        ? 'At your headcount, manually verifying device settings no longer works.'
        : p.deviceModel === 'byod' && sensitiveData(p)
          ? 'Sensitive data on personal devices needs enforced controls, not trust.'
          : null,
    promote: (p) => (p.teamSize === 'large' || has(p.complianceTargets, 'hipaa') ? 'thirty' : null),
    frameworks: ['SOC 2 CC6.7', 'CIS 4.1', 'ISO 27001 A.8.1'],
  },
  {
    id: 'edr',
    title: 'Install endpoint protection (EDR/antivirus)',
    category: 'devices',
    why: 'Modern endpoint protection catches malware and flags suspicious behavior that built-in defenses miss — and enterprise customers will ask about it.',
    how: [
      'Start with the built-ins turned on everywhere: Microsoft Defender on Windows, XProtect/Gatekeeper on macOS.',
      'When budget allows or a customer questionnaire demands it, deploy a managed EDR agent to all endpoints.',
      'Route alerts somewhere someone will actually see them (email or a chat channel).',
    ],
    tools: ['CrowdStrike Falcon Go', 'SentinelOne', 'Microsoft Defender for Business'],
    effort: 'hours',
    cost: 'medium',
    phase: 'ninety',
    when: (p) =>
      p.teamSize === 'medium' || p.teamSize === 'large'
        ? 'A bigger fleet means more chances for one compromised laptop to spread.'
        : has(p.customers, 'enterprise', 'government')
          ? 'Enterprise and government security questionnaires almost always require endpoint protection.'
          : null,
    frameworks: ['SOC 2 CC6.8', 'CIS 10.1', 'ISO 27001 A.8.7'],
  },

  // ───────────────────────────── Data Protection ─────────────────────────────
  {
    id: 'data-inventory',
    title: 'Map what data you hold and where it lives',
    category: 'data',
    why: 'You cannot protect what you have not named. A one-page data map drives every other decision — what to encrypt, back up, delete, and disclose if breached.',
    how: [
      'List each kind of data you handle (customer PII, payment records, credentials, analytics…).',
      'For each: where it is stored, who can access it, and how sensitive it is.',
      'Mark the systems holding your most sensitive data — those get controls first.',
      'Delete data you are storing "just in case" — data you do not hold cannot leak.',
    ],
    effort: 'hours',
    cost: 'free',
    phase: 'now',
    baseline: true,
    frameworks: ['SOC 2 CC3.2', 'CIS 3.1', 'ISO 27001 A.5.9', 'GDPR Art. 30'],
  },
  {
    id: 'backups',
    title: 'Set up automatic, tested backups',
    category: 'data',
    why: 'Ransomware, a bad migration, or one wrong DELETE can end a startup that has no restorable backups.',
    how: [
      'Identify the data whose loss would hurt most (production database, file storage, key documents).',
      'Turn on automated backups: managed database snapshots, cloud storage versioning, and workspace backup for documents.',
      'Keep at least one copy outside the primary system or account, so one compromised credential cannot delete both.',
      'Actually restore something once a quarter — an untested backup is a hope, not a plan.',
    ],
    effort: 'hours',
    cost: 'low',
    phase: 'now',
    baseline: true,
    satisfiedBy: 'backups',
    frameworks: ['SOC 2 A1.2', 'CIS 11.2', 'ISO 27001 A.8.13'],
  },
  {
    id: 'secrets-management',
    title: 'Get secrets out of code, chat, and .env files',
    category: 'data',
    why: 'API keys and database credentials scattered through code and Slack are the fastest route from a small leak to a full compromise.',
    how: [
      'Store application secrets in your platform\'s secret manager, injected at deploy time.',
      'Never commit secrets — add .env to .gitignore and use example files with placeholders.',
      'Share human credentials only through the password manager.',
      'Rotate any secret that has ever been committed or pasted into chat — assume it is burned.',
    ],
    tools: ['AWS Secrets Manager', 'GCP Secret Manager', 'Doppler', '1Password'],
    effort: 'hours',
    cost: 'low',
    phase: 'thirty',
    when: (p) => (hasCode(p) ? 'You have a codebase, so application secrets need a proper home.' : null),
    promote: (p) => (has(p.dataTypes, 'credentials') ? 'now' : null),
    frameworks: ['SOC 2 CC6.1', 'CIS 3.11', 'ISO 27001 A.8.24'],
  },
  {
    id: 'encryption-in-transit',
    title: 'Enforce encryption in transit (HTTPS/TLS everywhere)',
    category: 'data',
    why: 'Unencrypted traffic can be read or modified by anyone on the path — and browsers and customers treat non-HTTPS products as broken.',
    how: [
      'Serve every public endpoint over HTTPS with certificates that auto-renew.',
      'Redirect HTTP to HTTPS and enable HSTS once you are confident.',
      'Use TLS for internal connections too: database, queues, and admin panels.',
    ],
    tools: ["Let's Encrypt", 'Caddy', 'Cloudflare'],
    effort: 'hours',
    cost: 'free',
    phase: 'now',
    when: (p) => (shipsProduct(p) || hasInfra(p) ? 'You run internet-facing systems that need TLS.' : null),
    frameworks: ['SOC 2 CC6.7', 'CIS 3.10', 'ISO 27001 A.8.24'],
  },
  {
    id: 'encryption-at-rest',
    title: 'Encrypt sensitive data at rest',
    category: 'data',
    why: 'Encryption at rest means a leaked disk image, snapshot, or bucket is not automatically a readable copy of your customer data.',
    how: [
      'Enable at-rest encryption on databases, object storage, and volumes (one checkbox on most managed platforms).',
      'Encrypt backups with the same care as the primary data.',
      'For especially sensitive fields (health data, government IDs), consider application-level encryption on top.',
    ],
    effort: 'hours',
    cost: 'free',
    phase: 'thirty',
    when: (p) =>
      sensitiveData(p) && hasInfra(p)
        ? 'You store sensitive data in infrastructure you control.'
        : null,
    promote: (p) => (has(p.dataTypes, 'health', 'payments') ? 'now' : null),
    frameworks: ['SOC 2 CC6.7', 'CIS 3.11', 'ISO 27001 A.8.24', 'HIPAA §164.312'],
  },
  {
    id: 'data-retention',
    title: 'Write a simple data retention and deletion policy',
    category: 'data',
    why: 'Old data is pure liability: it can leak, it bloats breach impact, and privacy laws require you to delete what you no longer need.',
    how: [
      'For each data type in your inventory, decide how long you actually need it.',
      'Automate deletion where possible (log retention settings, database TTLs, scheduled jobs).',
      'Document the schedule in a page — this doubles as evidence for GDPR and SOC 2.',
      'Handle deletion requests: know how you would erase one customer\'s data end to end.',
    ],
    effort: 'hours',
    cost: 'free',
    phase: 'ninety',
    when: (p) =>
      has(p.dataTypes, 'pii', 'health', 'financial', 'children')
        ? 'You hold personal data that privacy rules expect you to minimize and delete.'
        : null,
    frameworks: ['GDPR Art. 5', 'SOC 2 C1.2', 'ISO 27001 A.8.10'],
  },

  // ─────────────────────────── Cloud & Infrastructure ────────────────────────
  {
    id: 'cloud-root-lockdown',
    title: 'Lock down your cloud root/owner account',
    category: 'cloud',
    why: 'The root account can do — and destroy — everything, including deleting backups and the audit trail. It should be almost never used.',
    how: [
      'Set a long unique password on the root/owner account and add hardware-key MFA.',
      'Remove root API keys entirely.',
      'Create named admin users/roles for daily work; reserve root for the rare tasks that require it.',
      'Set the root email to a monitored group address, not one person\'s inbox.',
    ],
    effort: 'minutes',
    cost: 'free',
    phase: 'now',
    when: (p) => (hasCloud(p) ? 'You run on a cloud provider whose root account needs protecting.' : null),
    frameworks: ['SOC 2 CC6.1', 'CIS 5.4', 'AWS Well-Architected SEC01'],
  },
  {
    id: 'cloud-iam-least-privilege',
    title: 'Apply least-privilege IAM in your cloud',
    category: 'cloud',
    why: 'Over-broad cloud permissions turn one leaked key or phished developer into a total compromise.',
    how: [
      'Give humans SSO-backed roles, not long-lived access keys.',
      'Scope service roles to the specific actions and resources they need — avoid wildcard-everything policies.',
      'Rotate or eliminate long-lived access keys; prefer short-lived credentials.',
      'Review IAM users, roles, and keys quarterly and delete the unused ones.',
    ],
    effort: 'days',
    cost: 'free',
    phase: 'thirty',
    when: (p) => (hasCloud(p) ? 'You run on a cloud provider where IAM is the primary security boundary.' : null),
    frameworks: ['SOC 2 CC6.3', 'CIS 6.8', 'ISO 27001 A.8.2'],
  },
  {
    id: 'cloud-audit-logging',
    title: 'Turn on cloud audit logging',
    category: 'cloud',
    why: 'Without an audit trail you cannot answer the only question that matters after an incident: what happened?',
    how: [
      'Enable the provider audit log (AWS CloudTrail, GCP Cloud Audit Logs, Azure Activity Log) in all regions.',
      'Send logs to a bucket the day-to-day admins cannot delete.',
      'Add basic alerts for red flags: root login, MFA disabled, IAM policy changes.',
    ],
    effort: 'hours',
    cost: 'low',
    phase: 'thirty',
    when: (p) => (hasCloud(p) ? 'Your cloud account needs an audit trail for investigations and audits.' : null),
    frameworks: ['SOC 2 CC7.2', 'CIS 8.2', 'ISO 27001 A.8.15'],
  },
  {
    id: 'network-exposure',
    title: 'Close unnecessary network exposure',
    category: 'cloud',
    why: 'Databases and admin panels exposed to the internet get found by scanners within hours, not days.',
    how: [
      'Put databases, caches, and internal services on private networks — nothing but the app should be public.',
      'Restrict SSH/RDP to a VPN or identity-aware proxy instead of 0.0.0.0/0.',
      'Scan your own perimeter (e.g. with an online port scanner) and justify every open port.',
      'On PaaS platforms, review which preview/staging deployments are publicly reachable.',
    ],
    tools: ['Tailscale', 'Cloudflare Access'],
    effort: 'hours',
    cost: 'free',
    phase: 'thirty',
    when: (p) => (hasInfra(p) ? 'You run infrastructure whose network exposure needs minimizing.' : null),
    promote: (p) => (has(p.infra, 'onprem') ? 'now' : null),
    frameworks: ['SOC 2 CC6.6', 'CIS 12.2', 'ISO 27001 A.8.20'],
  },
  {
    id: 'email-auth',
    title: 'Set up SPF, DKIM, and DMARC on your domain',
    category: 'cloud',
    why: 'Without email authentication, anyone can send mail as you — phishing your customers and investors from your own domain.',
    how: [
      'Publish an SPF record listing the services allowed to send as your domain.',
      'Enable DKIM signing in your email provider and any sending services (marketing, transactional).',
      'Add a DMARC record starting at p=none with reports, then tighten to quarantine/reject once reports look clean.',
    ],
    tools: ['Your DNS provider', 'dmarcian', 'Postmark DMARC monitoring'],
    effort: 'hours',
    cost: 'free',
    phase: 'thirty',
    baseline: true,
    frameworks: ['CIS 9.5', 'ISO 27001 A.5.14'],
  },
  {
    id: 'domain-dns-security',
    title: 'Protect your domains and DNS',
    category: 'cloud',
    why: 'Whoever controls your DNS controls your product, email, and password resets. Domain hijacking is rare but catastrophic.',
    how: [
      'Enable MFA and registrar lock on your domain accounts.',
      'Set domains to auto-renew with a payment method that will not silently expire.',
      'Limit who can change DNS, and treat DNS changes like production deploys.',
    ],
    effort: 'minutes',
    cost: 'free',
    phase: 'thirty',
    baseline: true,
    frameworks: ['CIS 4.6', 'ISO 27001 A.5.9'],
  },

  // ─────────────────────────── Application Security ──────────────────────────
  {
    id: 'branch-protection',
    title: 'Protect your main branch and require code review',
    category: 'appsec',
    why: 'Review catches both honest mistakes and malicious changes before they ship, and an unprotected main branch means anyone (or any leaked token) can push straight to production.',
    how: [
      'Enable branch protection on main: require pull requests and at least one approval.',
      'Require status checks (tests, linters) to pass before merge.',
      'Disable force-pushes to main and limit who can bypass the rules.',
      'Solo founders: still use PRs — future-you reviewing calmer than present-you is worth it, and the habit scales.',
    ],
    effort: 'minutes',
    cost: 'free',
    phase: 'thirty',
    when: (p) => (hasCode(p) ? 'You maintain a codebase whose main branch needs protecting.' : null),
    frameworks: ['SOC 2 CC8.1', 'CIS 16.1', 'ISO 27001 A.8.25'],
  },
  {
    id: 'dependency-scanning',
    title: 'Turn on automated dependency scanning',
    category: 'appsec',
    why: 'Most of your codebase is other people\'s code. Known-vulnerable dependencies are the most common way web apps get popped.',
    how: [
      'Enable Dependabot (GitHub) or the equivalent for your platform on every repo.',
      'Turn on security alerts and automatic update PRs.',
      'Actually merge the updates — schedule a weekly slot so they do not pile up.',
      'Pin dependencies with a lockfile so builds are reproducible.',
    ],
    tools: ['Dependabot', 'Renovate', 'Snyk'],
    effort: 'minutes',
    cost: 'free',
    phase: 'thirty',
    satisfiedBy: 'dependency-scanning',
    when: (p) => (hasCode(p) ? 'Your product is built on third-party dependencies that need monitoring.' : null),
    frameworks: ['SOC 2 CC7.1', 'CIS 16.4', 'ISO 27001 A.8.28'],
  },
  {
    id: 'secret-scanning',
    title: 'Enable secret scanning and push protection',
    category: 'appsec',
    why: 'Committed credentials are harvested by bots within minutes of a repo going public — and they lurk in private repo history too.',
    how: [
      'Enable secret scanning with push protection on your code host.',
      'Scan existing history for leaked secrets and rotate anything found.',
      'Add a pre-commit hook (e.g. gitleaks) for defense in depth.',
    ],
    tools: ['GitHub secret scanning', 'gitleaks', 'trufflehog'],
    effort: 'minutes',
    cost: 'free',
    phase: 'thirty',
    when: (p) => (hasCode(p) ? 'Your repositories need protection against accidentally committed secrets.' : null),
    frameworks: ['SOC 2 CC6.1', 'CIS 16.12'],
  },
  {
    id: 'staging-prod-separation',
    title: 'Separate production from development environments',
    category: 'appsec',
    why: 'When staging shares credentials or data with production, every experiment risks customer data and every dev laptop is a production key.',
    how: [
      'Use separate cloud accounts/projects (or at minimum separate credentials) for production vs. development.',
      'Never use real customer data in development — generate fake data or scrub exports.',
      'Restrict production access to the few people who operate it.',
    ],
    effort: 'days',
    cost: 'free',
    phase: 'ninety',
    when: (p) =>
      hasCode(p) && hasInfra(p) ? 'You deploy software and need blast-radius separation between environments.' : null,
    promote: (p) => (sensitiveData(p) ? 'thirty' : null),
    frameworks: ['SOC 2 CC8.1', 'CIS 16.8', 'ISO 27001 A.8.31'],
  },
  {
    id: 'appsec-basics',
    title: 'Cover the OWASP-style application basics',
    category: 'appsec',
    why: 'Injection, broken auth, and missing access checks are decades old and still behind most web breaches — attackers use scanners, so the basics are the whole game early on.',
    how: [
      'Use your framework\'s built-ins: parameterized queries/ORM, template escaping, CSRF protection.',
      'Never roll your own auth or crypto — use a battle-tested library or managed auth.',
      'Enforce authorization on the server for every request; never trust client-side checks.',
      'Validate and limit all input (size, type, format), including file uploads.',
      'Set security headers (CSP, HSTS, X-Content-Type-Options) and secure cookie flags.',
    ],
    tools: ['OWASP ASVS', 'Mozilla Observatory', 'Auth0/Clerk/Cognito for managed auth'],
    effort: 'days',
    cost: 'free',
    phase: 'thirty',
    when: (p) => (shipsProduct(p) && hasCode(p) ? 'You ship a product that will face automated and manual attacks.' : null),
    frameworks: ['SOC 2 CC8.1', 'OWASP Top 10', 'ISO 27001 A.8.26'],
  },
  {
    id: 'rate-limiting',
    title: 'Add rate limiting and bot protection',
    category: 'appsec',
    why: 'Without rate limits, attackers can brute-force logins, scrape data, and rack up your infrastructure bill overnight.',
    how: [
      'Rate-limit authentication endpoints aggressively (login, signup, password reset, OTP).',
      'Add sensible global limits per IP/user on the API.',
      'Put a CDN/WAF in front of public apps for DDoS absorption and managed rules.',
      'Alert on unusual spikes so you notice abuse early.',
    ],
    tools: ['Cloudflare', 'AWS WAF', 'fastify-rate-limit / express-rate-limit'],
    effort: 'hours',
    cost: 'low',
    phase: 'ninety',
    when: (p) => (shipsProduct(p) ? 'Your public endpoints need protection from brute force and abuse.' : null),
    promote: (p) => (has(p.productTypes, 'api', 'ecommerce', 'marketplace') ? 'thirty' : null),
    frameworks: ['SOC 2 CC6.6', 'OWASP API4'],
  },
  {
    id: 'vulnerability-disclosure',
    title: 'Publish a security contact and disclosure policy',
    category: 'appsec',
    why: 'Researchers who find a hole in your product need a way to tell you that is not a public tweet.',
    how: [
      'Create security@yourdomain and route it somewhere monitored.',
      'Publish a /.well-known/security.txt file and a short "report a vulnerability" page.',
      'Commit to acknowledging reports within a few business days.',
      'A paid bug bounty can wait; a working inbox cannot.',
    ],
    effort: 'minutes',
    cost: 'free',
    phase: 'ninety',
    when: (p) => (shipsProduct(p) ? 'External researchers need a channel to report vulnerabilities in your product.' : null),
    frameworks: ['ISO 27001 A.8.8', 'CIS 16.2'],
  },
  {
    id: 'pentest',
    title: 'Get a penetration test of your product',
    category: 'appsec',
    why: 'A good pentest finds the issues your team is too close to see — and enterprise buyers increasingly require a recent report before signing.',
    how: [
      'Wait until the obvious basics (this plan\'s earlier items) are done, or you will pay to be told what you already know.',
      'Scope it to your core product and its APIs; a 1–2 week engagement is typical for a startup.',
      'Fix the highs and criticals, then request a retest letter — that is the artifact customers want.',
      'Repeat annually or after major architectural changes.',
    ],
    tools: ['Cobalt', 'Doyensec', 'Cure53', 'independent boutiques'],
    effort: 'days',
    cost: 'high',
    phase: 'ninety',
    satisfiedBy: 'pentest',
    when: (p) =>
      shipsProduct(p) && (has(p.customers, 'enterprise', 'government') || wantsAudit(p))
        ? 'Enterprise deals and audits will ask for a recent penetration test report.'
        : shipsProduct(p) && sensitiveData(p)
          ? 'You ship a product handling sensitive data — independent testing is worth the spend once basics are done.'
          : null,
    frameworks: ['SOC 2 CC4.1', 'ISO 27001 A.8.29', 'PCI DSS 11.4'],
  },

  // ─────────────────────────────── SaaS & Vendors ────────────────────────────
  {
    id: 'vendor-inventory',
    title: 'Keep a list of every SaaS tool and vendor',
    category: 'vendors',
    why: 'Your security is only as good as the forgotten tool with customer data and no MFA that nobody remembers signing up for.',
    how: [
      'List every service the company uses; mine email receipts, card statements, and SSO logs to find the strays.',
      'Note for each: what data it touches, who owns the account, and how you would revoke access.',
      'Cancel and close what you no longer use.',
      'Review the list quarterly alongside access reviews.',
    ],
    effort: 'hours',
    cost: 'free',
    phase: 'thirty',
    baseline: true,
    frameworks: ['SOC 2 CC9.2', 'CIS 15.1', 'ISO 27001 A.5.19'],
  },
  {
    id: 'vendor-review',
    title: 'Vet vendors before giving them sensitive data',
    category: 'vendors',
    why: 'When a vendor holding your customer data gets breached, it is your incident, your disclosure, and your reputation.',
    how: [
      'Before adopting a tool that will touch customer or sensitive data, check for SOC 2/ISO 27001 reports and their security page.',
      'Prefer vendors supporting SSO and MFA; grant the least data access that works.',
      'Sign a DPA when personal data is involved.',
      'Keep it proportional: a heavier look for data processors, a glance for a font library.',
    ],
    effort: 'hours',
    cost: 'free',
    phase: 'ninety',
    when: (p) =>
      sensitiveData(p)
        ? 'Vendors will process your sensitive data, so they inherit your risk.'
        : null,
    frameworks: ['SOC 2 CC9.2', 'ISO 27001 A.5.19', 'GDPR Art. 28'],
  },
  {
    id: 'oauth-app-review',
    title: 'Review third-party OAuth grants quarterly',
    category: 'vendors',
    why: 'Every "Sign in and grant access" click gives an outside app standing access to your email, files, or code — long after you stop using it.',
    how: [
      'In Google Workspace/Microsoft 365 admin, review third-party app grants and revoke stale ones.',
      'Do the same for GitHub/GitLab OAuth apps and personal access tokens.',
      'Restrict or require approval for new high-scope grants where your workspace supports it.',
    ],
    effort: 'minutes',
    cost: 'free',
    phase: 'ongoing',
    baseline: true,
    frameworks: ['SOC 2 CC6.3', 'CIS 5.3'],
  },

  // ─────────────────────────────── People & Culture ──────────────────────────
  {
    id: 'phishing-awareness',
    title: 'Train the team to spot phishing and scams',
    category: 'people',
    why: 'Nearly every startup breach starts with a message: a fake invoice, a "CEO" asking for gift cards, a spoofed login page.',
    how: [
      'Run a 30-minute session covering: checking sender domains, hovering links, and never entering credentials from an emailed link.',
      'Agree on a verification norm: money movements and credential requests get confirmed on a second channel.',
      'Make reporting easy and blame-free — "I clicked something weird" should be praised, not punished.',
      'Repeat briefly for every new joiner.',
    ],
    tools: ['Free: built-in Google/Microsoft phishing protections', 'Later: KnowBe4, Riot'],
    effort: 'hours',
    cost: 'free',
    phase: 'thirty',
    baseline: true,
    satisfiedBy: 'security-training',
    frameworks: ['SOC 2 CC2.2', 'CIS 14.1', 'ISO 27001 A.6.3'],
  },
  {
    id: 'security-owner',
    title: 'Name a security owner',
    category: 'people',
    why: 'Security that is everyone\'s job is no one\'s job. One named owner keeps this plan moving even when things get busy.',
    how: [
      'Pick one person (a founder is fine) to own security decisions and this checklist.',
      'Give them a recurring 30-minute slot each month to review progress and new risks.',
      'They do not do all the work — they make sure it happens and gets unblocked.',
    ],
    effort: 'minutes',
    cost: 'free',
    phase: 'now',
    baseline: true,
    frameworks: ['SOC 2 CC1.3', 'ISO 27001 A.5.2'],
  },
  {
    id: 'acceptable-use',
    title: 'Write a short acceptable-use & security policy',
    category: 'people',
    why: 'A one-page policy sets shared expectations — and it is the first document every compliance framework and enterprise questionnaire asks for.',
    how: [
      'Cover: password manager and MFA required, device rules (encryption, lock screens), data handling, and how to report incidents.',
      'Keep it to a page or two of plain language people will actually read.',
      'Have everyone acknowledge it (a form or signed doc) and include it in onboarding.',
      'Revisit annually — date and version it.',
    ],
    effort: 'hours',
    cost: 'free',
    phase: 'thirty',
    when: (p) =>
      notSolo(p)
        ? 'With a team, expectations need writing down before they can be followed.'
        : wantsAudit(p)
          ? 'Written policies are the entry ticket to the frameworks you are targeting.'
          : null,
    frameworks: ['SOC 2 CC2.2', 'ISO 27001 A.5.1', 'CIS 14.1'],
  },

  // ───────────────────────────── Incident Readiness ──────────────────────────
  {
    id: 'incident-plan',
    title: 'Write a one-page incident response plan',
    category: 'incident',
    why: 'In a real incident you will be stressed and tempted to improvise. A one-pager written on a calm day beats a great plan you never wrote.',
    how: [
      'Define what counts as an incident and who takes charge (your security owner).',
      'List first moves: preserve evidence, contain (rotate credentials, isolate systems), then assess.',
      'Include a contact sheet: team, hosting provider, lawyer, insurer, and where to find customer comms templates.',
      'Note breach-notification duties for your data types and regions (e.g. GDPR\'s 72-hour rule).',
      'Walk through one scenario as a team once a year — a 45-minute tabletop is plenty.',
    ],
    effort: 'hours',
    cost: 'free',
    phase: 'thirty',
    baseline: true,
    satisfiedBy: 'incident-plan',
    frameworks: ['SOC 2 CC7.3', 'CIS 17.1', 'ISO 27001 A.5.24'],
  },
  {
    id: 'monitoring-alerting',
    title: 'Set up basic monitoring and alerting',
    category: 'incident',
    why: 'The average breach goes unnoticed for months. Basic alerts shrink "attacker dwell time" from months to hours.',
    how: [
      'Centralize application and infrastructure logs somewhere searchable.',
      'Alert on security-relevant events: repeated failed logins, new admin accounts, logins from new countries, disabled MFA.',
      'Alert on availability: uptime checks on your public endpoints.',
      'Route alerts to a channel someone actually watches, and tune out the noise.',
    ],
    tools: ['Your cloud\'s native tools', 'Grafana', 'Datadog', 'UptimeRobot'],
    effort: 'days',
    cost: 'low',
    phase: 'ninety',
    when: (p) => (hasInfra(p) ? 'You run systems whose compromise you need to detect, not just prevent.' : null),
    frameworks: ['SOC 2 CC7.2', 'CIS 8.11', 'ISO 27001 A.8.16'],
  },
  {
    id: 'cyber-insurance',
    title: 'Consider cyber liability insurance',
    category: 'incident',
    why: 'Incident response, forensics, legal counsel, and notification costs can sink an early-stage company. Insurance converts a fatal event into an expensive one.',
    how: [
      'Get quotes once you hold meaningful customer data or sign contracts that require coverage.',
      'Read what the policy actually covers: incident response costs, business interruption, liability.',
      'Expect the application to ask about MFA, backups, and training — completing this plan literally lowers your premium.',
    ],
    effort: 'hours',
    cost: 'medium',
    phase: 'ninety',
    when: (p) =>
      sensitiveData(p) || has(p.customers, 'enterprise', 'government')
        ? 'The data you hold and the customers you serve make incident costs material.'
        : null,
    frameworks: ['SOC 2 CC9.1'],
  },
  {
    id: 'status-comms',
    title: 'Prepare customer communication templates',
    category: 'incident',
    why: 'How you communicate during an incident determines whether customers remember a company that handled it well or one that went silent.',
    how: [
      'Draft skeleton messages now: incident acknowledged, update, resolution, and (worst case) breach notification.',
      'Stand up a status page or decide where updates will be posted.',
      'Agree on who approves external comms during an incident.',
    ],
    tools: ['Instatus', 'Atlassian Statuspage', 'BetterStack'],
    effort: 'hours',
    cost: 'low',
    phase: 'ninety',
    when: (p) => (shipsProduct(p) && p.stage !== 'idea' ? 'You have live customers who will need answers during an incident.' : null),
    frameworks: ['SOC 2 CC2.3', 'ISO 27001 A.5.26'],
  },

  // ─────────────────────────── Policies & Compliance ─────────────────────────
  {
    id: 'privacy-policy',
    title: 'Publish an accurate privacy policy',
    category: 'compliance',
    why: 'If you collect personal data, a privacy policy is legally required in most markets — and an inaccurate one is worse than none.',
    how: [
      'Base it on your data inventory: what you collect, why, where it goes, how long you keep it, and user rights.',
      'Use a reputable generator or template as a start, then make it match reality.',
      'Have a lawyer review it once you are handling data at scale or in regulated categories.',
      'Update it when your data practices change — it should track your data map.',
    ],
    effort: 'hours',
    cost: 'low',
    phase: 'thirty',
    when: (p) =>
      has(p.dataTypes, 'pii', 'health', 'financial', 'children')
        ? 'You collect personal data, which legally requires accurate privacy disclosure.'
        : null,
    frameworks: ['GDPR Art. 13', 'CCPA'],
  },
  {
    id: 'gdpr-basics',
    title: 'Cover the GDPR basics',
    category: 'compliance',
    why: 'GDPR applies to anyone serving EU users, regardless of where the company sits — and its basics overlap heavily with good security anyway.',
    how: [
      'Maintain your data inventory as a record of processing (Article 30).',
      'Establish a lawful basis for each processing purpose and collect consent where needed.',
      'Sign DPAs with processors handling personal data for you.',
      'Build the ability to export and delete a user\'s data on request.',
      'Know the 72-hour breach notification rule and fold it into your incident plan.',
    ],
    effort: 'days',
    cost: 'low',
    phase: 'ninety',
    when: (p) => (has(p.complianceTargets, 'gdpr') ? 'You identified GDPR as applicable to your business.' : null),
    frameworks: ['GDPR'],
  },
  {
    id: 'hipaa-basics',
    title: 'Meet HIPAA obligations for health data',
    category: 'compliance',
    why: 'Handling US health data without HIPAA compliance risks fines and — more immediately — no healthcare customer will sign without it.',
    how: [
      'Confirm whether you are a covered entity or (more likely) a business associate.',
      'Sign BAAs with every vendor touching PHI — including your cloud provider (AWS/GCP/Azure all offer them).',
      'Encrypt PHI at rest and in transit; restrict and log all access to it.',
      'Run the required risk analysis and document policies; consider a HIPAA-focused compliance tool.',
      'Train everyone who touches PHI.',
    ],
    tools: ['Vanta', 'Drata', 'Accountable'],
    effort: 'days',
    cost: 'medium',
    phase: 'thirty',
    when: (p) =>
      has(p.dataTypes, 'health') || has(p.complianceTargets, 'hipaa')
        ? 'You handle health data, which triggers HIPAA obligations.'
        : null,
    frameworks: ['HIPAA'],
  },
  {
    id: 'pci-scope',
    title: 'Minimize PCI scope for card payments',
    category: 'compliance',
    why: 'Touching raw card numbers puts you under the full weight of PCI DSS. Letting a payment processor hold the cards makes most of that burden disappear.',
    how: [
      'Use a processor\'s hosted fields/checkout (Stripe, Adyen, Braintree) so card numbers never hit your servers.',
      'Confirm your integration qualifies for SAQ A (the lightest PCI questionnaire) and complete it.',
      'Never log, store, or email card numbers — even "temporarily".',
    ],
    tools: ['Stripe', 'Adyen', 'Braintree'],
    effort: 'hours',
    cost: 'free',
    phase: 'thirty',
    when: (p) =>
      has(p.dataTypes, 'payments') || has(p.complianceTargets, 'pci')
        ? 'You accept card payments, which brings PCI DSS into scope.'
        : null,
    frameworks: ['PCI DSS'],
  },
  {
    id: 'soc2-prep',
    title: 'Start a SOC 2 / ISO 27001 readiness track',
    category: 'compliance',
    why: 'Enterprise buyers use SOC 2 or ISO 27001 as a gate. Starting readiness early is dramatically cheaper than a panicked pre-deal scramble.',
    how: [
      'Finish the foundational items in this plan first — they map directly onto the framework controls.',
      'Pick a compliance automation platform to collect evidence continuously.',
      'Choose SOC 2 Type I (point in time) as a fast first milestone, then Type II (over a period).',
      'Budget realistically: platform plus auditor typically runs $20–50k and 3–6 months.',
    ],
    tools: ['Vanta', 'Drata', 'Secureframe', 'Thoropass'],
    effort: 'days',
    cost: 'high',
    phase: 'ninety',
    when: (p) =>
      has(p.complianceTargets, 'soc2', 'iso27001')
        ? 'You are targeting a formal security certification.'
        : has(p.customers, 'enterprise')
          ? 'Enterprise customers will sooner or later require SOC 2 or equivalent.'
          : null,
    frameworks: ['SOC 2', 'ISO 27001'],
  },
  {
    id: 'child-privacy',
    title: 'Meet children\'s privacy requirements (COPPA/age gates)',
    category: 'compliance',
    why: 'Data about children is regulated far more strictly than adult data, with serious fines and platform bans for getting it wrong.',
    how: [
      'Determine whether your product is directed at children or knowingly collects their data.',
      'Implement age screening and verifiable parental consent where required (COPPA in the US, GDPR-K in the EU).',
      'Minimize ruthlessly: collect nothing from children you can operate without.',
      'Get specialist legal advice — this area is unforgiving.',
    ],
    effort: 'days',
    cost: 'medium',
    phase: 'now',
    when: (p) =>
      has(p.dataTypes, 'children')
        ? 'You handle data about children, which carries the strictest privacy rules.'
        : null,
    frameworks: ['COPPA', 'GDPR Art. 8'],
  },
  {
    id: 'mobile-store-security',
    title: 'Harden your mobile app and store presence',
    category: 'appsec',
    why: 'Mobile apps face extra risks: insecure local storage, leaky APIs behind the app, and store policies that can pull your app overnight.',
    how: [
      'Store tokens in the platform keystore (Keychain/Keystore), never in plain files or prefs.',
      'Pin or at least strictly validate TLS; assume the API will be called by attackers directly, not just your app.',
      'Keep signing keys in a secure account with MFA — losing them means losing your app identity.',
      'Review store privacy questionnaires (App Store privacy labels, Play data safety) so declarations match reality.',
    ],
    effort: 'days',
    cost: 'free',
    phase: 'thirty',
    when: (p) => (has(p.productTypes, 'mobile') ? 'You ship a mobile app with its own attack surface and store obligations.' : null),
    frameworks: ['OWASP MASVS'],
  },
  {
    id: 'hardware-device-security',
    title: 'Secure your hardware/IoT devices and updates',
    category: 'appsec',
    why: 'Shipped devices cannot be patched by pushing a web deploy — insecure firmware in the field is a permanent, internet-connected liability.',
    how: [
      'Ship a secure over-the-air update mechanism with signed firmware from day one.',
      'No default or shared passwords across devices; unique per-device credentials.',
      'Encrypt device-to-cloud traffic and authenticate devices individually so one stolen key does not expose the fleet.',
      'Plan end-of-life: how long will you ship security updates, and what happens after?',
    ],
    effort: 'days',
    cost: 'medium',
    phase: 'thirty',
    when: (p) => (has(p.productTypes, 'hardware') ? 'You ship hardware whose firmware and fleet need securing for years.' : null),
    frameworks: ['ETSI EN 303 645', 'CIS 1'],
  },
  {
    id: 'client-data-handling',
    title: 'Set client data handling ground rules',
    category: 'data',
    why: 'Agencies and consultancies hold the crown jewels of many clients at once — a single compromised laptop can breach every client contract you have.',
    how: [
      'Keep each client\'s data segregated (separate folders/workspaces with scoped access).',
      'Only pull client data you need, and delete it when the engagement ends.',
      'Check contracts for security obligations you have already signed up to — many specify controls and breach notification windows.',
      'Use client-provided accounts where possible so data stays in their systems.',
    ],
    effort: 'hours',
    cost: 'free',
    phase: 'thirty',
    when: (p) => (has(p.productTypes, 'agency') ? 'You handle client data under contract, concentrating multiple companies\' risk.' : null),
    frameworks: ['ISO 27001 A.5.20', 'SOC 2 C1.1'],
  },
  {
    id: 'payment-fraud-controls',
    title: 'Add payment fraud and chargeback controls',
    category: 'compliance',
    why: 'Card fraud and chargebacks can freeze your payment processing entirely — for an e-commerce startup that is an extinction event.',
    how: [
      'Turn on your processor\'s fraud tooling (e.g. Stripe Radar) and 3-D Secure for risky transactions.',
      'Set velocity limits and review rules for unusually large or rapid orders.',
      'Document your refund and dispute process; respond to disputes quickly with evidence.',
    ],
    tools: ['Stripe Radar', 'Adyen RevenueProtect'],
    effort: 'hours',
    cost: 'low',
    phase: 'ninety',
    when: (p) =>
      has(p.productTypes, 'ecommerce', 'marketplace') && has(p.dataTypes, 'payments')
        ? 'You process payments at volume, making fraud an operational risk.'
        : null,
    frameworks: ['PCI DSS'],
  },
  {
    id: 'wire-fraud-controls',
    title: 'Protect the money: verify payment changes out-of-band',
    category: 'people',
    why: 'Business email compromise — a fake "updated bank details" email — steals more from small companies than any malware does.',
    how: [
      'Rule: any new payee or changed bank details gets verified by phone/video on a known-good number before money moves.',
      'Require two people (or two steps) for payments above a threshold you choose.',
      'Enable notifications on all bank and payment accounts.',
      'Brief whoever pays invoices — they are the target.',
    ],
    effort: 'minutes',
    cost: 'free',
    phase: 'now',
    baseline: true,
    frameworks: ['SOC 2 CC2.2', 'CIS 14.1'],
  },
  {
    id: 'remote-work-hygiene',
    title: 'Set remote-work security norms',
    category: 'devices',
    why: 'A distributed team means company data flows through home networks, personal routers, and coffee-shop Wi-Fi by default.',
    how: [
      'All company access happens from encrypted, screen-locked devices (see device controls).',
      'HTTPS-everywhere makes public Wi-Fi mostly fine; for admin access to infrastructure, require the VPN/zero-trust path.',
      'Tell people to keep home router firmware updated and change default admin passwords.',
      'Video calls: use waiting rooms or authenticated links for meetings where sensitive matters are discussed.',
    ],
    tools: ['Tailscale', 'Cloudflare WARP'],
    effort: 'hours',
    cost: 'free',
    phase: 'ninety',
    when: (p) =>
      p.workModel === 'remote' || p.workModel === 'hybrid'
        ? 'Your team works outside an office, so the perimeter is each person\'s device and connection.'
        : null,
    frameworks: ['ISO 27001 A.6.7', 'CIS 12'],
  },
  {
    id: 'office-physical',
    title: 'Cover basic physical security at the office',
    category: 'devices',
    why: 'Tailgating into a small office and walking out with an unlocked laptop remains embarrassingly effective.',
    how: [
      'Control who can enter: locks, and a norm of greeting unfamiliar faces.',
      'Lock laptops or take them home; secure any server/network gear in a locked cabinet.',
      'Shred sensitive paper; keep whiteboards with credentials or customer data out of camera view.',
      'Separate guest Wi-Fi from the network your devices use.',
    ],
    effort: 'hours',
    cost: 'low',
    phase: 'ninety',
    when: (p) =>
      p.workModel === 'office' || p.workModel === 'hybrid'
        ? 'You have a physical office that is part of your attack surface.'
        : null,
    frameworks: ['ISO 27001 A.7.1', 'SOC 2 CC6.4'],
  },
  {
    id: 'government-requirements',
    title: 'Scope government customer security requirements early',
    category: 'compliance',
    why: 'Government contracts carry specific security regimes (FedRAMP, CMMC, StateRAMP, IRAP…) that can take a year or more — discovering this mid-procurement kills deals.',
    how: [
      'Identify which regime applies to your target agencies and data (e.g. FedRAMP for US federal SaaS).',
      'Ask your agency champion what they actually require — sometimes an agency ATO or lighter path exists.',
      'Factor certification cost and timeline into your sales plan before committing.',
      'Consider landing via an already-certified marketplace or prime contractor first.',
    ],
    effort: 'days',
    cost: 'high',
    phase: 'ninety',
    when: (p) => (has(p.customers, 'government') ? 'You sell to government buyers who mandate specific certifications.' : null),
    frameworks: ['FedRAMP', 'CMMC'],
  },
];

/** Look up a control by id (used by tests and the dashboard). */
export const CONTROL_BY_ID: Record<string, Control> = Object.fromEntries(
  CONTROLS.map((c) => [c.id, c]),
);
