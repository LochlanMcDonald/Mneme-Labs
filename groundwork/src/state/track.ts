// Google Ads conversion counting, in its most restrained form. The tag is
// loaded in index.html configured with ad personalization signals off; the
// only event ever sent is the one below, fired once when a visitor's first
// plan is generated. No plan content, answers, or identity ride along.

declare global {
  interface Window {
    gtag?: (...args: unknown[]) => void;
  }
}

const TAG_ID = 'AW-18352192932';
// The conversion action's label from Google Ads ("Plan generated").
const PLAN_GENERATED_LABEL = 'REPLACE_WITH_LABEL';

/** Count a first plan generation. Safe to call when the tag is absent. */
export function reportPlanGenerated(): void {
  if (PLAN_GENERATED_LABEL.startsWith('REPLACE')) return;
  try {
    window.gtag?.('event', 'conversion', {
      send_to: `${TAG_ID}/${PLAN_GENERATED_LABEL}`,
    });
  } catch {
    // Tracking must never break the app.
  }
}
