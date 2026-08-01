export type Severity = 'critical' | 'high' | 'medium' | 'low';

export type SeverityCounts = Record<Severity, number>;

/** A vendor the panel knows how to talk to. */
export interface VendorDef {
  id: string;
  name: string;
  /** Short line shown on the picker card. */
  blurb: string;
  /** Default console URL the tile links out to. */
  consoleUrl: string;
  /** Credential fields the setup form asks for. */
  fields: {
    key: string;
    label: string;
    secret?: boolean;
    placeholder?: string;
    /** May be left blank; the connector falls back to a sensible default. */
    optional?: boolean;
  }[];
  /** Flavor accent used for the tile stripe. */
  accent: 'blueberry' | 'grape' | 'tangerine' | 'lime' | 'strawberry';
  /** True when the connector is implemented; others show as planned. */
  ready: boolean;
}

/** A configured vendor instance (credentials live only in the local config). */
export interface VendorConfig {
  id: string;
  /** Console URL override, e.g. a tenant-specific link. */
  consoleUrl?: string;
  /** Alert total the user last marked as reviewed. */
  seenTotal?: number;
}

/** One poll result for a tile. */
export interface PollResult {
  id: string;
  ok: boolean;
  /** Open alerts right now. */
  total: number;
  severities: SeverityCounts;
  checkedAt: string;
  error?: string;
}
