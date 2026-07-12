// Content for the Help area: incident first-aid playbooks and general
// guidance for questions that come up along the way.

export interface HelpEntry {
  id: string;
  title: string;
  intro?: string;
  steps: string[];
}

export const INCIDENT_PLAYBOOKS: HelpEntry[] = [
  {
    id: 'account-takeover',
    title: 'An account was phished or taken over',
    steps: [
      'From a device you trust, change the account password and end all active sessions ("sign out everywhere").',
      'Turn on MFA if it was off, and remove any MFA methods or recovery emails/phones you do not recognize.',
      'Check for changes the attacker made: mail forwarding rules, new OAuth app grants, added admin users, changed payout details.',
      'If the account is email, assume every account that resets through it is at risk. Rotate the important ones.',
      'Tell the team what the phish looked like so nobody else falls for the same message.',
    ],
  },
  {
    id: 'leaked-secret',
    title: 'A credential or API key leaked',
    steps: [
      'Rotate the secret immediately. Treat every secret that touched a public repo, chat, or pastebin as burned, even if it was only exposed for minutes.',
      'Check usage logs for the exposed key (cloud audit logs, provider dashboards) for activity you do not recognize.',
      'Search your repo history for other secrets while you are at it; leaks rarely travel alone.',
      'If the key had write or admin scope, review what it could have changed and verify those resources.',
      'Add secret scanning and push protection so the next one gets caught before it lands.',
    ],
  },
  {
    id: 'lost-device',
    title: 'A laptop or phone was lost or stolen',
    steps: [
      'Trigger a remote lock right away, then a remote wipe if recovery looks unlikely.',
      'Sign the device out of everything centrally: end its sessions in your identity provider, email, password manager, and chat.',
      'If the disk was not encrypted, treat everything on it as exposed and plan disclosure accordingly.',
      'Rotate any credentials that were stored or cached on the device.',
      'File a police report if stolen; insurers and some disclosure rules ask for one.',
    ],
  },
  {
    id: 'malware',
    title: 'Ransomware or malware on a device',
    steps: [
      'Disconnect the device from networks immediately. Do not power it off if you may need forensics; isolate it instead.',
      'Do not pay a ransom or negotiate before getting professional advice and, if insured, calling your insurer\'s hotline.',
      'From a clean device, rotate the credentials that were used on the infected machine.',
      'Check whether backups are intact and uncompromised before restoring anything.',
      'Rebuild the machine from scratch rather than trusting a cleanup, unless a professional clears it.',
    ],
  },
  {
    id: 'data-exposure',
    title: 'Customer data may have been exposed',
    steps: [
      'Contain first: close the hole (revoke access, fix the bucket policy, patch the endpoint) before anything else.',
      'Preserve evidence: logs, timestamps, and a copy of what was exposed. You will need them for scope and notifications.',
      'Work out what data, whose, and over what period. Your data inventory makes this far faster.',
      'Check your notification duties: GDPR expects regulator notice within 72 hours; several US state laws and many customer contracts have their own clocks.',
      'Get legal advice before external statements, but do not go silent on affected customers. Honest and early beats polished and late.',
    ],
  },
  {
    id: 'payment-fraud',
    title: 'Money was sent to a fraudster (invoice or wire fraud)',
    steps: [
      'Call your bank immediately and ask them to recall the transfer. Speed matters more than anything here; recalls sometimes work within hours.',
      'Report it: in the US, file with the FBI\'s IC3 the same day. Other countries have equivalent fast-track fraud lines.',
      'Figure out how the fraudster got in (spoofed email, compromised inbox, fake domain) and close that door.',
      'Warn your finance contacts and vendors; fraudsters often hit the same relationship twice.',
      'Adopt an out-of-band verification rule for any future payment change, if you have not already.',
    ],
  },
];

export const GENERAL_FAQS: HelpEntry[] = [
  {
    id: 'where-to-start',
    title: 'This feels overwhelming. Where do we actually start?',
    steps: [
      'Start with the "Do this week" phase of your plan. Those items are cheap, fast, and cut the most risk per hour spent.',
      'Password manager, MFA, disk encryption, and backups eliminate the attacks that actually hit small companies.',
      'Ignore everything else until those are done. A short list finished beats a long list started.',
    ],
  },
  {
    id: 'budget',
    title: 'How much should an early startup spend on security?',
    intro: 'Less than you fear, but more than zero.',
    steps: [
      'Under 10 people: a password manager and a few licenses, roughly $10 to $20 per person per month, covers the essentials. Most other early controls are free settings.',
      'Growing toward enterprise sales: budget for a pentest ($8k to $25k) and, when customers demand it, SOC 2 (roughly $20k to $50k all-in the first year).',
      'The biggest spend is attention, not money. A few focused hours a month keeps the plan moving.',
    ],
  },
  {
    id: 'no-security-person',
    title: 'Nobody on the team is a security expert. Who should own this?',
    steps: [
      'Pick the person who is most systematic, not the most technical. Most early controls are process and settings, not deep expertise.',
      'Give them explicit time for it (a monthly review block) so it does not silently fall off.',
      'When something exceeds the team, buy help for that specific thing: a fractional CISO day, a pentest firm, or your insurer\'s resources.',
    ],
  },
  {
    id: 'questionnaires',
    title: 'A customer sent us a huge security questionnaire. What now?',
    steps: [
      'Answer honestly. "Planned for next quarter" is an acceptable answer; a false "yes" discovered later can kill the deal and the relationship.',
      'Your Groundwork plan export maps to most questionnaire sections, so use it as the source of truth.',
      'Keep every completed questionnaire; the next one will reuse 80% of the answers.',
      'If questionnaires start arriving monthly, that is the signal to start SOC 2, which replaces many of them.',
    ],
  },
  {
    id: 'when-soc2',
    title: 'When is the right time to do SOC 2?',
    steps: [
      'When deals are blocked without it, and not much sooner. It is a sales unlock, not a security upgrade.',
      'Do the foundational controls in your plan first; they are most of the audit anyway.',
      'Start with Type I to unblock deals quickly, then run the Type II observation window.',
    ],
  },
  {
    id: 'insurance-worth-it',
    title: 'Is cyber insurance actually worth it?',
    steps: [
      'Once you hold real customer data or sign contracts requiring it, usually yes. Incident response retainers, forensics, and legal fees add up fast.',
      'The application doubles as a checklist: insurers ask for MFA, backups, and training, which you are already doing.',
      'Read the exclusions carefully, especially around social engineering losses; that is where small companies actually get hurt.',
    ],
  },
  {
    id: 'cant-finish',
    title: 'We cannot get through the whole plan. Is partial progress worth anything?',
    steps: [
      'Yes. Risk drops steeply with the first controls and flattens after; the "Do this week" items carry most of the value.',
      'Mark honestly what is done, in progress, and not applicable, and revisit monthly.',
      'A plan that is 40% done and current is worth more than one that is 100% "done" on paper.',
    ],
  },
];
